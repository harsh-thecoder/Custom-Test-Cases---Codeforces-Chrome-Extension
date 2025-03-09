// content.js - Shortened Codeforces Test Validator
(function() {
    // At the very top of your content script
    console.log("Codeforces Validator content script loaded");
    
    // Unique ID prefix to avoid conflicts 
    const idPrefix = 'cf_validator_' + Math.random().toString(36).substr(2, 5) + '_';
    // Define ids using let instead of const if you need to modify it later
    let ids = {
      input: idPrefix + 'input',
      button: idPrefix + 'button',
      result: idPrefix + 'result',
      output: idPrefix + 'output'
    };
    
    // Global state
    let uiInitialized = false;
    window.cfValidatorErrors = [];
    
    // Extract problem IDs from URL
    function getProblemInfo() {
      const url = window.location.href;
      let contestId, problemId;
      
      if (url.includes('/contest/')) {
        const match = url.match(/\/contest\/(\d+)\/problem\/([A-Z][0-9]?)/);
        if (match) [, contestId, problemId] = match;
      } else if (url.includes('/problemset/problem/')) {
        const match = url.match(/\/problemset\/problem\/(\d+)\/([A-Z][0-9]?)/);
        if (match) [, contestId, problemId] = match;
      }
      
      return { contestId, problemId };
    }
    
    // Log errors consistently
    function logError(message, error) {
      const errorInfo = { 
        message, 
        timestamp: new Date().toISOString(),
        error: error?.message,
        stack: error?.stack 
      };
      window.cfValidatorErrors = window.cfValidatorErrors || [];
      window.cfValidatorErrors.push(errorInfo);
      console.error(message, error || '');
    }
    
    // Create or recreate UI
    function createUI() {
      try {
        // Remove existing UI if present
        const existingContainer = document.querySelector('.cf-test-validator-container');
        if (existingContainer) existingContainer.remove();
        
        // Create new container
        const container = document.createElement('div');
        container.className = 'cf-test-validator-container';
        container.innerHTML = `
          <div class="cf-test-validator-header">
            <h3>Custom Test Validator</h3>
          </div>
          <div class="cf-test-validator-body">
            <textarea id="${ids.input}" placeholder="Enter your custom test case here..."></textarea>
            <div class="cf-test-validator-controls">
              <button id="${ids.button}">Get Expected Output</button>
            </div>
            <div id="${ids.result}" class="cf-test-validator-result">
              <pre id="${ids.output}"></pre>
            </div>
          </div>
        `;
        
        // Find insertion point - try multiple options
        const insertionPoints = [
          document.querySelector('.problem-statement'),
          document.querySelector('.problemindexholder'),
          document.querySelector('.content-with-sidebar'),
          document.querySelector('.content')
        ];
        
        let inserted = false;
        for (const point of insertionPoints) {
          if (point) {
            point.parentNode.insertBefore(container, point.nextSibling);
            inserted = true;
            break;
          }
        }
        
        // Fallback: append to body
        if (!inserted) document.body.appendChild(container);
        
        // Add click event listener
        const button = document.getElementById(ids.button);
        if (button) button.addEventListener('click', validateTestCase);
        
        // Check if UI was created successfully
        uiInitialized = Object.values(ids).every(id => !!document.getElementById(id));
        return uiInitialized;
      } catch (error) {
        logError('Error creating UI:', error);
        return false;
      }
    }
    
    // Get element safely
    function getElement(idKey) {
      return document.getElementById(ids[idKey]);
    }
    
    // Show status messages
    function showStatus(message, isError = false) {
      const resultElement = getElement('result');
      if (!resultElement) return false;
      
      resultElement.innerHTML = `<div class="${isError ? 'error' : 'loading'}">${message}</div>`;
      resultElement.classList.add('show');
      return true;
    }
    
    // Main validation function
    // Main validation function
async function validateTestCase() {
    console.log("validateTestCase started");
    
    try {
      // Ensure UI exists
      if (!uiInitialized && !createUI()) {
        alert('Failed to initialize UI. Please reload the page.');
        return;
      }
      
      // Get elements
      const inputElement = getElement('input');
      const resultElement = getElement('result');
      const outputElement = getElement('output');
      
      if (!inputElement || !resultElement || !outputElement) {
        uiInitialized = false;
        if (createUI()) {
          return validateTestCase(); // Try again with new UI
        } else {
          alert('UI elements missing. Please reload the page.');
          return;
        }
      }
      
      // Get problem info - IMPORTANT: Do this before trying to use contestId & problemId
      let { contestId, problemId } = getProblemInfo();
      console.log("Problem info:", { contestId, problemId });
      
      if (!contestId || !problemId) {
        showStatus("Couldn't determine problem information from URL", true);
        return;
      }
      
      // Get input
      const testInput = inputElement.value;
      if (!testInput || testInput.trim().length === 0) {
        showStatus("Please enter a valid test input", true);
        return;
      }
      
      // Process validation
      showStatus("Finding an accepted solution...");
      
      let submissionInfo, sourceCode, result;
      
      try {
        // 1. Get submission ID
        submissionInfo = await getAcceptedSubmissionInfo(contestId, problemId);
        
        // 2. Get source code
        showStatus(`Fetching solution code (Submission #${submissionInfo.submissionId})...`);
        sourceCode = await getSubmissionSourceCode(contestId, submissionInfo.submissionId);
        
        // 3. Execute code
        showStatus(`Running solution with your input (Language: ${submissionInfo.programmingLanguage})...`);
        result = await executeCode(sourceCode, submissionInfo.language, testInput);
        
        // 4. Display result - MOVED INTO THIS TRY BLOCK
        if (outputElement) {
            console.log("Received result:", result);
            
            // Check if there's an error flag or if the output contains error/warning messages
            const isError = result.error || 
                           (typeof result.output === 'string' && 
                            (result.output.includes("error:") || 
                             result.output.includes("warning:")));
            
            // Format the output with syntax highlighting if it contains errors/warnings
            if (isError && typeof result.output === 'string') {
              // Style the output to highlight errors and warnings
              const formattedOutput = result.output
                .replace(/error:/g, '<span class="error-text">error:</span>')
                .replace(/warning:/g, '<span class="warning-text">warning:</span>')
                .replace(/\n/g, '<br>');
              
              resultElement.innerHTML = `
                <div class="validation-result ${isError ? 'with-errors' : ''}">
                  <div class="result-header">${isError ? 'Compilation Errors/Warnings' : 'Execution Result'}</div>
                  <div class="result-content">${formattedOutput}</div>
                </div>
              `;
            } else {
              // Normal output display
              outputElement.textContent = typeof result === 'object' ? 
                (result.output || JSON.stringify(result, null, 2)) : 
                (result || 'No output returned');
            }
            
            resultElement.classList.add('show');
          } else {
          showStatus('UI error: Output element disappeared', true);
        }
      } catch (innerError) {
        // Handle errors from each step
        console.error("Step execution error:", innerError);
        showStatus(`Error: ${innerError.message || 'Unknown error occurred'}`, true);
      }
    } catch (error) {
      logError('Validation error:', error);
      console.error("Detailed validation error:", error);
      showStatus(error.message || 'Unknown error occurred', true);
    }
  }
    
    // Get submission info (API first, fallback to page scraping)
    async function getAcceptedSubmissionInfo(contestId, problemId) {
      try {
        return await getAcceptedSubmissionFromAPI(contestId, problemId);
      } catch (error) {
        console.error("API method failed:", error);
        return await getAcceptedSubmissionFromStatusPage(contestId, problemId);
      }
    }
    
    // Get submission from API
    async function getAcceptedSubmissionFromAPI(contestId, problemId) {
      const response = await fetch(`https://codeforces.com/api/contest.status?contestId=${contestId}&from=1&count=100`);
      if (!response.ok) throw new Error('Failed to fetch submissions from Codeforces API');
      
      const data = await response.json();
      if (data.status !== 'OK') throw new Error(`Codeforces API error: ${data.comment}`);
      
      // Find accepted solutions
      const acceptedSubmissions = data.result.filter(s => 
        s.problem.index === problemId && s.verdict === 'OK'
      );
      
      if (acceptedSubmissions.length === 0) {
        throw new Error('No accepted solutions found for this problem');
      }
      
      // Prioritize languages
      const languagePriority = { 'Python 3': 1, 'GNU C++17': 2, 'GNU C++14': 3, 'Java 11': 4 };
      
      // Sort by priority and recent submissions
      acceptedSubmissions.sort((a, b) => {
        const priorityA = languagePriority[a.programmingLanguage] || 100;
        const priorityB = languagePriority[b.programmingLanguage] || 100;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return b.creationTimeSeconds - a.creationTimeSeconds;
      });
      
      const best = acceptedSubmissions[0];
      return {
        programmingLanguage: best.programmingLanguage,
        language: mapLanguage(best.programmingLanguage),
        submissionId: best.id
      };
    }
    
    // Fallback: scrape status page
    async function getAcceptedSubmissionFromStatusPage(contestId, problemId) {
      const response = await fetch(`https://codeforces.com/contest/${contestId}/status/problem/${problemId}`);
      const html = await response.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const rows = doc.querySelectorAll('table.status-frame-datatable tr');
      
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const verdictCell = row.querySelector('td.status-verdict-cell');
        
        if (verdictCell && verdictCell.textContent.includes('Accepted')) {
          // Get submission ID
          const idCell = row.querySelector('td:first-child');
          const submissionLink = idCell?.querySelector('a');
          if (!submissionLink) continue;
          
          const submissionUrl = submissionLink.getAttribute('href');
          const submissionIdMatch = submissionUrl.match(/\/submission\/(\d+)/);
          if (!submissionIdMatch) continue;
          
          // Get language
          const langCell = row.querySelector('td:nth-child(5)');
          if (!langCell) continue;
          
          const programmingLanguage = langCell.textContent.trim();
          
          return {
            programmingLanguage,
            language: mapLanguage(programmingLanguage),
            submissionId: submissionIdMatch[1]
          };
        }
      }
      
      throw new Error('No accepted submissions found on status page');
    }
    
    // Get source code via chrome extension messaging
    async function getSubmissionSourceCode(contestId, submissionId) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: 'getSubmissionSourceCode',
            contestId,
            submissionId
          },
          response => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            
            if (response?.success) {
              resolve(response.sourceCode);
            } else {
              reject(new Error(response?.error || 'Unknown error fetching source code'));
            }
          }
        );
      });
    }
    
    // Execute code via chrome extension messaging
    async function executeCode(code, language, input) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: 'executeCode',
            code,
            language,
            input
          },
          response => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            
            if (response?.success) {
              resolve(response.data.output || response.data);
            } else {
              reject(new Error(response?.error || 'Unknown error executing code'));
            }
          }
        );
      });
    }
    
    // Map Codeforces language to execution API language
    function mapLanguage(cfLanguage) {
      const mapping = {
        "GNU C++17": "cpp17",
        "GNU C++14": "cpp14",
        "GNU C++20 (64)": "cpp17",
        "C++20 (GCC 13-64)": "cpp17",
        "Python 3": "python3",
        "Java 11": "java",
        "Java 21": "java",
        "Python": "python3",
        "C++": "cpp17",
        "C": "c",
        "Java 8": "java",
        "JavaScript": "nodejs"
      };
      
      // Try exact match
      if (mapping[cfLanguage]) return mapping[cfLanguage];
      
      // Try substring match
      for (const [key, value] of Object.entries(mapping)) {
        if (cfLanguage.includes(key)) return value;
      }
      
      // Default
      return "cpp17";
    }
    
    // Setup mutation observer to re-add UI if removed
    function setupMutationObserver() {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('.cf-test-validator-container')) {
          uiInitialized = false;
          createUI();
        }
      });
      
      observer.observe(document.body, { childList: true, subtree: true });
    }
    
    // Initialize on page load
    function init() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(createUI, 800));
      } else {
        setTimeout(createUI, 800);
      }
      setupMutationObserver();
    }
    
    // Start extension
    init();
})();