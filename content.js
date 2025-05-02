(function() {
  // Add CSS styles first
  function addStyles() {
      const styleElement = document.createElement('style');
      styleElement.textContent = `
          .cf-test-case-solver {
              margin: 20px 0;
              padding: 15px;
              background-color: #f8f9fa;
              border: 1px solid #ddd;
              border-radius: 5px;
          }
          
          .solver-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 10px;
          }
          
          .solver-header h3 {
              margin: 0;
              color: #4a76a8;
          }
          
          #toggleSolver {
              background-color: #4a76a8;
              color: white;
              border: none;
              padding: 5px 10px;
              border-radius: 3px;
              cursor: pointer;
          }
          
          #toggleSolver:hover {
              background-color: #3d6293;
          }
          
          .solver-body {
              margin-top: 10px;
          }
          
          #customInput {
              width: 100%;
              min-height: 100px;
              margin-bottom: 10px;
              padding: 8px;
              border: 1px solid #ddd;
              border-radius: 3px;
              font-family: monospace;
              resize: vertical;
          }
          
          #runCustomTest {
              background-color: #5cb85c;
              color: white;
              border: none;
              padding: 8px 15px;
              border-radius: 3px;
              cursor: pointer;
          }
          
          #runCustomTest:hover {
              background-color: #4cae4c;
          }
          
          .solver-result {
              margin-top: 15px;
              padding: 10px;
              background-color: #fff;
              border: 1px solid #ddd;
              border-radius: 3px;
              font-family: monospace;
              white-space: pre-wrap;
              max-height: 300px;
              overflow-y: auto;
              display: none;
          }
      `;
      document.head.appendChild(styleElement);
      console.log("Added CSS styles to the page");
  }

  // Insert UI elements
  function addCustomUI() {
      // Check if we're on a problem page
      if (!window.location.href.includes('/problem/')) {
          console.log("Not on a problem page, skipping UI injection");
          return;
      }
  
      console.log("Adding custom UI to problem page");
  
      // Create the container for our custom UI
      const container = document.createElement('div');
      container.className = 'cf-test-case-solver';
      container.innerHTML = `
          <div class="solver-header">
              <h3>Custom Test Case Solver</h3>
              <button id="toggleSolver">Show/Hide</button>
          </div>
          <div class="solver-body" style="display: none;">
              <textarea id="customInput" placeholder="Enter your test case here"></textarea>
              <button id="runCustomTest">Run Test</button>
              <div id="solverResult" class="solver-result"></div>
          </div>
      `;
  
      // Find a good place to insert our UI (after the problem statement)
      const problemStatement = document.querySelector('.problem-statement');
      if (problemStatement) {
          console.log("Found problem statement, inserting UI");
          problemStatement.parentNode.insertBefore(container, problemStatement.nextSibling);
      } else {
          console.warn("Problem statement not found");
      }
  
      // Add event listeners
      document.getElementById('toggleSolver').addEventListener('click', function() {
          const body = document.querySelector('.solver-body');
          body.style.display = body.style.display === 'none' ? 'block' : 'none';
          console.log("Toggled solver visibility to:", body.style.display);
      });
  
      document.getElementById('runCustomTest').addEventListener('click', function() {
          const input = document.getElementById('customInput').value.trim();
          if (!input) {
              document.getElementById('solverResult').textContent = 'Please enter a test case';
              document.getElementById('solverResult').style.display = 'block';
              return;
          }
  
          const problemInfo = getProblemInfo();
          console.log("Sending runTestCase message with problem info:", problemInfo);
  
          // Update the UI to show processing
          document.getElementById('solverResult').style.display = 'block';
          document.getElementById('solverResult').textContent = 'Processing your test case...';
  
          chrome.runtime.sendMessage({
              action: "runTestCase",
              input: input,
              problemInfo: problemInfo
          }, function(response) {
              console.log("Received response from runTestCase:", response);
              if (response && response.error) {
                  document.getElementById('solverResult').textContent = 'Error: ' + response.error;
              }
          });
      });
  }

  // Extract problem ID and contest ID from URL
  function getProblemInfo() {
      const url = window.location.href;
      let contestId, problemId;
  
      console.log("Extracting problem info from URL:", url);
  
      if (url.includes('/contest/')) {
          // Format: https://codeforces.com/contest/1234/problem/A
          const matches = url.match(/\/contest\/(\d+)\/problem\/([A-Z0-9]+)/i);
          if (matches) {
              contestId = matches[1];
              problemId = matches[2];
              console.log("Contest URL match:", contestId, problemId);
          }
      } else if (url.includes('/problemset/problem/')) {
          // Format: https://codeforces.com/problemset/problem/1234/A
          const matches = url.match(/\/problemset\/problem\/(\d+)\/([A-Z0-9]+)/i);
          if (matches) {
              contestId = matches[1];
              problemId = matches[2];
              console.log("Problemset URL match:", contestId, problemId);
          }
      }
  
      console.log("Extracted problem info:", { contestId, problemId });
      return { contestId, problemId };
  }

  // Initialize the content script
  console.log("Content script loaded");
  window.addEventListener('load', function() {
      console.log("Page loaded, adding styles and custom UI");
      addStyles();
      addCustomUI();
  });

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
      console.log("Content script received message:", request);
      
      if (request.action === "getProblemInfo") {
          const info = getProblemInfo();
          console.log("Sending problem info:", info);
          sendResponse(info);
          return true;
      } else if (request.action === "updateResult") {
          const resultElement = document.getElementById('solverResult');
          if (resultElement) {
              console.log("Updating result element with:", request.result);
              resultElement.textContent = request.result;
              resultElement.style.display = 'block';
          } else {
              console.warn("Result element not found");
          }
          return true;
      }
  });
})();