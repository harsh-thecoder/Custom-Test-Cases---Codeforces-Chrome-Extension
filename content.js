// content.js - Modified to show preprocessed code

(function() {
  // Unique ID prefix to avoid conflicts 
  const idPrefix = 'cf_validator_' + Math.random().toString(36).substr(2, 5) + '_';
  console.log('[CF Validator] Initializing with prefix:', idPrefix);
  
  // Define ids using let instead of const if you need to modify it later
  let ids = {
    input: idPrefix + 'input',
    button: idPrefix + 'button',
    result: idPrefix + 'result',
    output: idPrefix + 'output',
    preprocessed: idPrefix + 'preprocessed', // New ID for preprocessed code
    togglePreprocessed: idPrefix + 'toggle_preprocessed' // New ID for toggle button
  };
  
  // Global state
  let uiInitialized = false;
  window.cfValidatorErrors = [];
  
  // Extract problem IDs from URL
  function getProblemInfo() {
    const url = window.location.href;
    console.log('[CF Validator] Current URL:', url);
    let contestId, problemId;
    
    if (url.includes('/contest/')) {
      const match = url.match(/\/contest\/(\d+)\/problem\/([A-Z][0-9]?)/);
      if (match) {
        contestId = match[1];
        problemId = match[2];
      }
    } else if (url.includes('/problemset/problem/')) {
      const match = url.match(/\/problemset\/problem\/(\d+)\/([A-Z][0-9]?)/);
      if (match) {
        contestId = match[1];
        problemId = match[2];
      }
    }
    
    console.log('[CF Validator] Extracted problem info:', { contestId, problemId });
    return { contestId, problemId };
  }
  
  // Log errors consistently
  function logError(message, error) {
    console.error('[CF Validator] Error:', message, error);
    const errorInfo = { 
      message, 
      timestamp: new Date().toISOString(),
      error: error?.message,
      stack: error?.stack 
    };
    window.cfValidatorErrors = window.cfValidatorErrors || [];
    window.cfValidatorErrors.push(errorInfo);
  }
  
  // Create or recreate UI
  function createUI() {
    try {
      console.log('[CF Validator] Creating UI');
      // Remove existing UI if present
      const existingContainer = document.querySelector('.cf-test-validator-container');
      if (existingContainer) {
        console.log('[CF Validator] Removing existing UI');
        existingContainer.remove();
      }
      
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
            <button id="${ids.togglePreprocessed}" style="margin-left: 10px; display: none;">Show Preprocessed Code</button>
          </div>
          <div id="${ids.result}" class="cf-test-validator-result">
            <pre id="${ids.output}"></pre>
          </div>
          <div id="${ids.preprocessed}" class="cf-test-validator-preprocessed" style="display: none; margin-top: 15px; border-top: 1px solid #ccc; padding-top: 10px;">
            <h4>Preprocessed Code (Gemini)</h4>
            <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; max-height: 400px; overflow: auto;"></pre>
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
      
      console.log('[CF Validator] Looking for insertion points:', 
        insertionPoints.map(p => p ? p.className : 'null'));
      
      let inserted = false;
      for (const point of insertionPoints) {
        if (point) {
          console.log('[CF Validator] Inserting UI after:', point.className);
          point.parentNode.insertBefore(container, point.nextSibling);
          inserted = true;
          break;
        }
      }
      
      // Fallback: append to body
      if (!inserted) {
        console.log('[CF Validator] Fallback: appending to body');
        document.body.appendChild(container);
      }
      
      // Add click event listener
      const button = document.getElementById(ids.button);
      if (button) {
        console.log('[CF Validator] Adding click listener to button');
        button.addEventListener('click', validateTestCase);
      } else {
        console.error('[CF Validator] Button element not found!');
      }
      
      // Add toggle event listener for preprocessed code
      const toggleButton = document.getElementById(ids.togglePreprocessed);
      if (toggleButton) {
        console.log('[CF Validator] Adding click listener to toggle button');
        toggleButton.addEventListener('click', togglePreprocessedCode);
      }
      
      // Check if UI was created successfully
      uiInitialized = Object.values(ids).every(id => !!document.getElementById(id));
      console.log('[CF Validator] UI initialized:', uiInitialized);
      
      // Log all created elements to verify
      Object.entries(ids).forEach(([key, id]) => {
        const element = document.getElementById(id);
        console.log(`[CF Validator] Element "${key}":`, element ? 'Found' : 'Not found');
      });
      
      return uiInitialized;
    } catch (error) {
      logError('Error creating UI:', error);
      return false;
    }
  }
  
  // Toggle preprocessed code display
  function togglePreprocessedCode() {
    const preprocessedDiv = document.getElementById(ids.preprocessed);
    const toggleButton = document.getElementById(ids.togglePreprocessed);
    
    if (preprocessedDiv && toggleButton) {
      const isVisible = preprocessedDiv.style.display !== 'none';
      preprocessedDiv.style.display = isVisible ? 'none' : 'block';
      toggleButton.textContent = isVisible ? 'Show Preprocessed Code' : 'Hide Preprocessed Code';
    }
  }
  
  // Get element safely
  function getElement(idKey) {
    const element = document.getElementById(ids[idKey]);
    if (!element) {
      console.warn(`[CF Validator] Element with ID ${ids[idKey]} (${idKey}) not found!`);
    }
    return element;
  }
  
  // Show status messages
  function showStatus(message, isError = false) {
    console.log(`[CF Validator] Status update: ${message}`, isError ? '(Error)' : '');
    const resultElement = getElement('result');
    if (!resultElement) return false;
    
    // Clear previous content
    resultElement.innerHTML = '';
    
    // Create status message
    const statusDiv = document.createElement('div');
    statusDiv.className = isError ? 'error' : 'loading';
    statusDiv.textContent = message;
    resultElement.appendChild(statusDiv);
    
    // Make sure it's visible
    resultElement.classList.add('show');
    return true;
  }
  
  // Display preprocessed code in the UI
  function displayPreprocessedCode(code) {
    const preprocessedDiv = document.getElementById(ids.preprocessed);
    const toggleButton = document.getElementById(ids.togglePreprocessed);
    
    if (preprocessedDiv && toggleButton) {
      // Update the pre content
      const preElement = preprocessedDiv.querySelector('pre');
      if (preElement) {
        preElement.textContent = code;
      }
      
      // Show the toggle button
      toggleButton.style.display = 'inline-block';
    }
  }

  async function retryOperation(operation, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[CF Validator] Attempt ${attempt}/${maxRetries}`);
        return await operation();
      } catch (error) {
        console.warn(`[CF Validator] Attempt ${attempt} failed:`, error.message);
        lastError = error;
        
        if (attempt < maxRetries) {
          console.log(`[CF Validator] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          // Increase delay for next attempt (exponential backoff)
          delay = Math.min(delay * 2, 5000);
        }
      }
    }
    
    throw lastError;
  }

  async function checkLoginStatus() {
    try {
      const response = await fetch('https://codeforces.com/');
      if (!response.ok) {
        return false;
      }
      
      const html = await response.text();
      
      // Look for elements that indicate the user is logged in
      return html.includes('data-role="logout"') || 
             html.includes('logout">Logout</a>') ||
             html.includes('/profile/');
    } catch (error) {
      console.error('[CF Validator] Error checking login status:', error);
      return false;
    }
  }
  
  // Main validation function
  // Main validation function
  async function validateTestCase() {
    console.log('[CF Validator] validateTestCase called');
    try {
      // Ensure UI exists
      if (!uiInitialized && !createUI()) {
        console.error('[CF Validator] UI initialization failed');
        alert('Failed to initialize UI. Please reload the page.');
        return;
      }
      
      // Get elements
      const inputElement = getElement('input');
      const resultElement = getElement('result');
      const outputElement = getElement('output');
      
      if (!inputElement || !resultElement || !outputElement) {
        console.error('[CF Validator] Missing UI elements:', { 
          input: !!inputElement, 
          result: !!resultElement, 
          output: !!outputElement 
        });
        
        uiInitialized = false;
        if (createUI()) {
          return validateTestCase(); // Try again with new UI
        } else {
          alert('UI elements missing. Please reload the page.');
          return;
        }
      }
      
      // Reset preprocessed code section
      const toggleButton = document.getElementById(ids.togglePreprocessed);
      if (toggleButton) {
        toggleButton.style.display = 'none';
      }
      
      // Get problem info
      let { contestId, problemId } = getProblemInfo();
      
      if (!contestId || !problemId) {
        console.error('[CF Validator] Problem info not found');
        showStatus("Couldn't determine problem information from URL", true);
        return;
      }
      
      // Get input
      const testInput = inputElement.value;
      console.log('[CF Validator] Test input length:', testInput.length);
      
      if (!testInput || testInput.trim().length === 0) {
        console.warn('[CF Validator] Empty test input');
        showStatus("Please enter a valid test input", true);
        return;
      }
      
      // Make sure the result container is visible
      resultElement.classList.add('show');
      
      // Process validation
      showStatus("Finding an accepted solution...");
      
      try {
        // 1. Get submission ID
        console.log('[CF Validator] Getting accepted submission info');
        const submissionsInfo = await getAcceptedSubmissionInfo(contestId, problemId);
        console.log('[CF Validator] Submission info:', submissionsInfo);
        
        // Check if submissionsInfo is an array (multiple submissions) and take the first one
        const submission = Array.isArray(submissionsInfo) ? submissionsInfo[0] : submissionsInfo;
        
        if (!submission || !submission.submissionId) {
          throw new Error('No valid submission ID found');
        }
        
        // 2. Get source code
        showStatus(`Fetching solution code (Submission #${submission.submissionId})...`);
        console.log('[CF Validator] Fetching source code for submission:', submission.submissionId);
        const sourceCode = await getSubmissionSourceCode(contestId, submission.submissionId);
        console.log('[CF Validator] Source code fetched, length:', sourceCode.length);
        
        // 3. Execute code
        showStatus(`Running solution with your input (Language: ${submission.programmingLanguage})...`);
        console.log('[CF Validator] Executing code with language:', submission.language);
        const result = await executeCode(sourceCode, submission.language, testInput);
        console.log('[CF Validator] Execution result:', result);
        
        // 4. Display result - Clear status message first
        resultElement.innerHTML = ''; // Clear previous status message
        
        // Create new output element with controlled spacing
        const newOutputElement = document.createElement('pre');
        newOutputElement.id = ids.output;
        newOutputElement.style.margin = "0";
        newOutputElement.style.marginTop = "4px"; // Small, controlled top margin
        newOutputElement.style.padding = "0";
        resultElement.appendChild(newOutputElement);
        
        // Process the result string to remove unwanted whitespace at the beginning
        if (typeof result === 'string') {
          // Replace leading whitespace characters
          newOutputElement.textContent = result.replace(/^\s+/, '');
          console.log('[CF Validator] Result is a string, length:', result.length);
        } else if (typeof result === 'object') {
          // If it's an object with output property
          newOutputElement.textContent = result.output ? 
            result.output.replace(/^\s+/, '') : 
            JSON.stringify(result, null, 2).replace(/^\s+/, '');
          console.log('[CF Validator] Result is an object:', result);
          
          // Display preprocessed code if available
          if (result.processedCode) {
            displayPreprocessedCode(result.processedCode);
          }
        } else {
          newOutputElement.textContent = String(result || 'No output returned').replace(/^\s+/, '');
          console.log('[CF Validator] Result is of type:', typeof result);
        }
        
      } catch (innerError) {
        // Handle errors from each step
        console.error('[CF Validator] Inner execution error:', innerError);
        showStatus(`Error: ${innerError.message || 'Unknown error occurred'}`, true);
      }
    } catch (error) {
      logError('Validation error:', error);
      showStatus(error.message || 'Unknown error occurred', true);
    }

    const isLoggedIn = await checkLoginStatus();
    if (!isLoggedIn) {
      console.warn('[CF Validator] User is not logged in to Codeforces');
      showStatus("You might need to log in to Codeforces to access some solutions. Please log in and try again.", true);
      // Continue anyway, as some public submissions might still be accessible
    }
  }
  
  // Get submission info (API first, fallback to page scraping)
  async function getAcceptedSubmissionInfo(contestId, problemId) {
    console.log('[CF Validator] Getting submission info for:', { contestId, problemId });
    try {
      return await getAcceptedSubmissionFromAPI(contestId, problemId);
    } catch (error) {
      console.warn('[CF Validator] API method failed, trying page scraping:', error.message);
      return await getAcceptedSubmissionFromStatusPage(contestId, problemId);
    }
  }
  
  // Get submission from API
  // Modify getAcceptedSubmissionFromAPI to return multiple submissions
  async function getAcceptedSubmissionFromAPI(contestId, problemId) {
    console.log('[CF Validator] Calling Codeforces API for submissions');
    const apiUrl = `https://codeforces.com/api/contest.status?contestId=${contestId}&from=1&count=100`;
    console.log('[CF Validator] API URL:', apiUrl);
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.error('[CF Validator] API error:', response.status, response.statusText);
      throw new Error('Failed to fetch submissions from Codeforces API');
    }
    
    const data = await response.json();
    console.log('[CF Validator] API response status:', data.status);
    
    if (data.status !== 'OK') {
      console.error('[CF Validator] API returned error:', data.comment);
      throw new Error(`Codeforces API error: ${data.comment}`);
    }
    
    // Find accepted solutions
    const acceptedSubmissions = data.result.filter(s => 
      s.problem.index === problemId && s.verdict === 'OK'
    );
    
    console.log('[CF Validator] Found accepted submissions:', acceptedSubmissions.length);
    
    if (acceptedSubmissions.length === 0) {
      console.error('[CF Validator] No accepted solutions found');
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
    
    // Return top 3 submissions instead of just one
    const topSubmissions = acceptedSubmissions.slice(0, 3).map(submission => ({
      programmingLanguage: submission.programmingLanguage,
      language: mapLanguage(submission.programmingLanguage),
      submissionId: submission.id
    }));
    
    console.log('[CF Validator] Selected top submissions:', 
      topSubmissions.map(s => `${s.submissionId} (${s.programmingLanguage})`).join(', '));
    
    return topSubmissions;
  }
  
  // Fallback: scrape status page
  async function getAcceptedSubmissionFromStatusPage(contestId, problemId) {
    console.log('[CF Validator] Scraping status page for submissions');
    // Fixed status URL to look at all submissions for this problem
    const statusUrl = `https://codeforces.com/contest/${contestId}/status/${problemId}`;
    console.log('[CF Validator] Status page URL:', statusUrl);
    
    const response = await fetch(statusUrl);
    console.log('[CF Validator] Status page response:', response.status);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch status page: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log('[CF Validator] Got HTML, length:', html.length);
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const rows = doc.querySelectorAll('table.status-frame-datatable tr');
    console.log('[CF Validator] Found rows in table:', rows.length);
    
    if (rows.length <= 1) {
      throw new Error('No submissions found in status page');
    }
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const verdictCell = row.querySelector('td.status-verdict-cell');
      
      if (verdictCell && verdictCell.textContent.includes('Accepted')) {
        console.log('[CF Validator] Found accepted submission row:', i);
        
        // Get submission ID
        // Get submission ID
        const idCell = row.querySelector('td:first-child');
        const submissionLink = idCell?.querySelector('a');
        if (!submissionLink) {
          console.warn('[CF Validator] No submission link found in row:', i);
          continue;
        }

        const submissionUrl = submissionLink.getAttribute('href');
        console.log('[CF Validator] Submission URL from page:', submissionUrl);

        // Updated regex to handle different URL formats
        const submissionIdMatch = submissionUrl.match(/submission\/(\d+)/) || 
                                submissionUrl.match(/\/(\d+)$/);
        if (!submissionIdMatch) {
          console.warn('[CF Validator] Could not extract submission ID from URL:', submissionUrl);
          continue;
        }
        
        // Get language
        const langCell = row.querySelector('td:nth-child(5)');
        if (!langCell) {
          console.warn('[CF Validator] No language cell found in row:', i);
          continue;
        }
        
        const programmingLanguage = langCell.textContent.trim();
        console.log('[CF Validator] Found submission:', submissionIdMatch[1], 'Language:', programmingLanguage);
        
        return {
          programmingLanguage,
          language: mapLanguage(programmingLanguage),
          submissionId: submissionIdMatch[1]
        };
      }
    }
    
    console.error('[CF Validator] No accepted submissions found on status page');
    throw new Error('No accepted submissions found on status page');
  }
  
  // Get source code directly from the submission page
  async function getSubmissionSourceCode(contestId, submissionId) {
    console.log('[CF Validator] Fetching submission code:', { contestId, submissionId });
    
    try {
      // URL for the submission page
      const url = `https://codeforces.com/contest/${contestId}/submission/${submissionId}`;
      console.log('[CF Validator] Submission URL:', url);
      
      const response = await fetch(url);
      console.log('[CF Validator] Submission page response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch submission: ${response.status} ${response.statusText}`);
      }
      
      const html = await response.text();
      console.log('[CF Validator] Submission page HTML length:', html.length);
      
      // Parse the HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Try multiple possible selectors in order of preference
      const selectors = [
        'pre#program-source-text',
        '.source-code pre',
        '#sourceCodeTextarea',
        'pre.prettyprint',
        'pre.linenums',
        'pre.program-source',
        '.roundbox pre', // Some older pages use this
        'pre[id*="source"]', // Any pre with "source" in the ID
        'div.verdict-format pre', // Another possible location
        'pre' // Last resort - just find the first pre tag
      ];
      
      let sourceCode = null;
      let codeElement = null;
      
      // Try each selector until we find a match
      for (const selector of selectors) {
        codeElement = doc.querySelector(selector);
        if (codeElement) {
          console.log(`[CF Validator] Found code element using selector: ${selector}`);
          break;
        }
      }
      
      if (!codeElement) {
        // Last resort: search for a pattern in the HTML that might indicate the source code
        const sourceCodeMatch = html.match(/<pre[^>]*id="?program-source[^>]*>([\s\S]*?)<\/pre>/i) || 
                                html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
        
        if (sourceCodeMatch && sourceCodeMatch[1]) {
          console.log('[CF Validator] Found code using regex pattern match');
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = sourceCodeMatch[1];
          sourceCode = tempDiv.textContent;
        } else {
          console.error('[CF Validator] Code element not found in submission page');
          throw new Error('Source code not found on the submission page. Try visiting the submission page directly and ensure you are logged in to Codeforces.');
        }
      } else {
        // Get code content
        sourceCode = codeElement.textContent;
      }
      
      // Add a fallback to the "view source" attribute some pages use
      if (!sourceCode && codeElement && codeElement.getAttribute('data-src')) {
        sourceCode = atob(codeElement.getAttribute('data-src'));
        console.log('[CF Validator] Using data-src attribute for source code');
      }
      
      if (!sourceCode || sourceCode.trim().length === 0) {
        throw new Error('Source code was found but appears to be empty. This might be a private submission.');
      }
      
      console.log('[CF Validator] Source code fetched, length:', sourceCode.length);
      return sourceCode;
    } catch (error) {
      console.error('[CF Validator] Error fetching source code:', error);
      throw error;
    }
  }
  
  // Execute code via chrome extension messaging to JDoodle API
  async function executeCode(code, language, input) {
    console.log('[CF Validator] Sending message to execute code:', { language, codeLength: code.length });
    
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: 'executeCode',
          code,
          language,
          input
        },
        function(response) {
          console.log('[CF Validator] Execution response received:', response ? 'success: ' + response.success : 'null');
          
          if (chrome.runtime.lastError) {
            console.error('[CF Validator] Runtime error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (response?.success) {
            console.log('[CF Validator] Execution successful, output:', response.data);
            // Add preprocessed code to the result
            if (response.processedCode) {
              response.data.processedCode = response.processedCode;
            }
            // Add null check to handle cases where response.data might be undefined
            resolve(response.data?.output || response.data || 'No output received');
          } else {
            console.error('[CF Validator] Execution error:', response?.error);
            reject(new Error(response?.error || 'Unknown error executing code'));
          }
        }
      );
    });
  }
  
  function mapLanguage(cfLanguage) {
    console.log('[CF Validator] Mapping language:', cfLanguage);
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
    if (mapping[cfLanguage]) {
      console.log('[CF Validator] Exact language match:', mapping[cfLanguage]);
      return mapping[cfLanguage];
    }
    
    // Try substring match
    for (const [key, value] of Object.entries(mapping)) {
      if (cfLanguage.includes(key)) {
        console.log('[CF Validator] Substring language match:', key, '->', value);
        return value;
      }
    }
    
    // Default
    console.log('[CF Validator] No language match found, defaulting to cpp17');
    return "cpp17";
  }
  
  // Setup mutation observer to re-add UI if removed
  function setupMutationObserver() {
    console.log('[CF Validator] Setting up mutation observer');
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.cf-test-validator-container')) {
        console.log('[CF Validator] UI removed, reinitializing');
        uiInitialized = false;
        createUI();
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[CF Validator] Mutation observer active');
  }
  
  // Initialize on page load
  function init() {
    console.log('[CF Validator] Initializing extension');
    if (document.readyState === 'loading') {
      console.log('[CF Validator] Document still loading, adding DOMContentLoaded listener');
      document.addEventListener('DOMContentLoaded', () => setTimeout(createUI, 800));
    } else {
      console.log('[CF Validator] Document already loaded, creating UI with delay');
      setTimeout(createUI, 800);
    }
    setupMutationObserver();
  }
  
  // Start extension
  console.log('[CF Validator] Starting extension');
  init();
})();