// background.js

async function diagnoseSubmissionPage(contestId, submissionId) {
    return new Promise((resolve, reject) => {
      const submissionUrl = `https://codeforces.com/contest/${contestId}/submission/${submissionId}`;
      
      // Create a new tab to load the submission page
      chrome.tabs.create({ url: submissionUrl, active: true }, tab => {
        // Wait for the page to load
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            // Remove the listener
            chrome.tabs.onUpdated.removeListener(listener);
            
            // Execute script to analyze the page
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              function: () => {
                const diagnostics = {
                  url: window.location.href,
                  title: document.title,
                  elements: {
                    programSourceText: !!document.getElementById('program-source-text'),
                    roundboxPre: document.querySelectorAll('.roundbox pre').length,
                    submitSourceCodePre: document.querySelectorAll('.submitSourceCode pre').length,
                    aceContent: document.querySelectorAll('.ace_content').length,
                    prettyprint: document.querySelectorAll('.prettyprint').length,
                    sourceElements: Array.from(document.querySelectorAll('*'))
                      .filter(elem => elem.className && elem.className.includes && 
                          (elem.className.includes('source') || (elem.id && elem.id.includes('source')))).length,
                    submissionDivs: Array.from(document.querySelectorAll('div[id^="submission-"]')).length
                  },
                  html: document.documentElement.innerHTML.substring(0, 1000) + '...' // First 1000 chars of HTML
                };
                
                return diagnostics;
              }
            }, results => {
              // We don't close the tab here so you can inspect it manually
              
              if (chrome.runtime.lastError) {
                reject(new Error(`Script execution error: ${chrome.runtime.lastError.message}`));
                return;
              }
              
              const diagnostics = results[0]?.result;
              if (!diagnostics) {
                reject(new Error('Could not run diagnostics'));
                return;
              }
              
              resolve(diagnostics);
            });
          }
        });
      });
    });
}

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Background script received message:", request.action);

    if (request.action === 'diagnoseSubmission') {
        diagnoseSubmissionPage(request.contestId, request.submissionId)
          .then(diagnostics => sendResponse({success: true, diagnostics}))
          .catch(error => sendResponse({success: false, error: error.message}));
        return true; // Required for async sendResponse
    }

    if (request.action === 'executeCode') {
        console.log("Executing code with JDoodle API");
        executeJdoodleCode(request.code, request.language, request.input)
            .then(result => {
                console.log("JDoodle execution result:", result);
                sendResponse({success: true, data: result});
            })
            .catch(error => {
                console.error("JDoodle execution error:", error);
                sendResponse({
                    success: false, 
                    error: error.message,
                    details: {
                        stack: error.stack,
                        name: error.name
                    }
                });
            });
        return true; // Required for async sendResponse
    }
    
    // New message handler for getting submission source code
    if (request.action === 'getSubmissionSourceCode') {
        console.log("Fetching submission code for contestId:", request.contestId, "submissionId:", request.submissionId);
        fetchSubmissionCode(request.contestId, request.submissionId)
            .then(sourceCode => {
                console.log("Source code fetched successfully");
                sendResponse({success: true, sourceCode});
            })
            .catch(error => {
                console.error("Error fetching source code:", error);
                sendResponse({success: false, error: error.message});
            });
        return true; // Required for async sendResponse
    }
});
  
// Function to execute code with JDoodle
async function executeJdoodleCode(code, language, input) {
    console.log(`Executing ${language} code with JDoodle`);
    
    const jdoodleEndpoint = 'https://api.jdoodle.com/v1/execute';
    const clientId = 'f5813c60373beca24a2ebab22dfd746'; 
    const clientSecret = '4f7bfffa4f7f289857bc2b27c48dc1307ff13fd48a5a79511bc8225c75c38009';
    
    // Prepare request body
    const requestBody = JSON.stringify({
        clientId, 
        clientSecret, 
        script: code,
        language, 
        versionIndex: "0", 
        stdin: input
    });
    
    try {
        console.log("Sending request to JDoodle API");
        
        // Try with fetch first
        try {
            const response = await fetch(jdoodleEndpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: requestBody
            });
            
            console.log("JDoodle API response status:", response.status);
            
            // Handle different status codes
            if (response.status === 500) {
                return { 
                    output: "The code execution service returned an error (500). This may be due to:\n" +
                            "- API usage limits\n- Service temporarily unavailable\n- Invalid code or input" 
                };
            }
            
            if (!response.ok) {
                const errorText = await response.text();
                return { output: `Code execution service error (${response.status}): ${errorText}` };
            }
            
            const data = await response.json();
            return data;
        } catch (fetchError) {
            console.error("Fetch error:", fetchError);
            
            // If fetch fails, try with XMLHttpRequest as a fallback
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', jdoodleEndpoint, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                
                xhr.onload = function() {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            resolve(data);
                        } catch (parseError) {
                            resolve({ output: `Error parsing response: ${xhr.responseText.substring(0, 100)}...` });
                        }
                    } else if (xhr.status === 500) {
                        resolve({ 
                            output: "The code execution service returned an error (500). This may be due to:\n" +
                                    "- API usage limits\n- Service temporarily unavailable\n- Invalid code or input" 
                        });
                    } else {
                        resolve({ output: `Code execution service error (${xhr.status}): ${xhr.responseText}` });
                    }
                };
                
                xhr.onerror = function() {
                    resolve({ 
                        output: "Network error connecting to code execution service. " +
                                "This might be due to CORS restrictions or network connectivity issues." 
                    });
                };
                
                xhr.send(requestBody);
            });
        }
    } catch (error) {
        console.error("Execution error:", error);
        return { 
            output: `Network or parsing error: ${error.message}\n` +
                    "This might be due to:\n- Network connectivity issues\n" +
                    "- API rate limits\n- Invalid API credentials" 
        };
    }
}
  
// Improved function to fetch source code from a submission
async function fetchSubmissionCode(contestId, submissionId) {
    console.log(`Fetching source code for contest ${contestId}, submission ${submissionId}`);
    
    // We use a different approach - create a new tab, get the code, and close the tab
    return new Promise((resolve, reject) => {
        // URL of the submission page - try both formats
        let submissionUrl;
        
        // First, try with contest view
        submissionUrl = `https://codeforces.com/contest/${contestId}/submission/${submissionId}`;
        console.log("Trying submission URL:", submissionUrl);
      
        // Function to extract code from the submission page
        function extractCodeFromPage() {
            // This function runs in the context of the submission page
            try {
                console.log("Extracting code from page:", window.location.href);
                
                // Try multiple selectors to find the code
                let sourceCode = null;
                
                // Method 1: Check for the standard program-source-text element
                const codeElement = document.querySelector('#program-source-text');
                if (codeElement) {
                    console.log("Found code using #program-source-text");
                    sourceCode = codeElement.textContent;
                }
                
                // Method 2: Check for pre tags within specific divs
                if (!sourceCode) {
                    const preTags = document.querySelectorAll('.roundbox pre, .submitSourceCode pre');
                    for (const pre of preTags) {
                        if (pre.textContent && pre.textContent.trim().length > 0) {
                            console.log("Found code using pre tags in roundbox/submitSourceCode");
                            sourceCode = pre.textContent;
                            break;
                        }
                    }
                }
                
                // Method 3: Look for code inside syntax highlighting elements
                if (!sourceCode) {
                    const syntaxElements = document.querySelectorAll('.ace_content, .prettyprint');
                    for (const elem of syntaxElements) {
                        if (elem.textContent && elem.textContent.trim().length > 0) {
                            console.log("Found code using syntax highlighting elements");
                            sourceCode = elem.textContent;
                            break;
                        }
                    }
                }
                
                // Method 4: Last resort - look for any elements with class containing "source"
                if (!sourceCode) {
                    const sourceElements = Array.from(document.querySelectorAll('*'))
                    .filter(elem => elem.className && elem.className.includes && 
                            (elem.className.includes('source') || elem.id && elem.id.includes('source')));
                    
                    for (const elem of sourceElements) {
                        if (elem.textContent && elem.textContent.trim().length > 10) { // Basic validation
                            console.log("Found code using elements with 'source' in class/id");
                            sourceCode = elem.textContent;
                            break;
                        }
                    }
                }
                
                // Method 5: Check for the Codeforces submission viewer format
                if (!sourceCode) {
                    // Sometimes Codeforces loads the code with JavaScript into a DIV with a specific ID pattern
                    const submissionDivs = Array.from(document.querySelectorAll('div[id^="submission-"]'));
                    for (const div of submissionDivs) {
                        if (div.textContent && div.textContent.trim().length > 10) {
                            console.log("Found code using div[id^='submission-']");
                            sourceCode = div.textContent;
                            break;
                        }
                    }
                }
                
                // If we found code, do basic validation to make sure it looks like code
                if (sourceCode) {
                    // Check if it looks like code (contains common programming constructs)
                    const codeIndicators = ['(', ')', '{', '}', ';', '=', 'return', 'if', 'for', 'while', 'int', 'void'];
                    const hasCodeIndicators = codeIndicators.some(indicator => sourceCode.includes(indicator));
                    
                    if (hasCodeIndicators) {
                        console.log("Source code appears valid (contains code indicators)");
                        return sourceCode;
                    } else {
                        console.log("Source code doesn't contain expected code indicators");
                    }
                } else {
                    console.log("No source code found using any method");
                }
                
                // As a last resort, get the entire page HTML for debugging
                return '// EXTRACTION_FAILED\n' + document.documentElement.innerHTML.substring(0, 2000) + "...";
            } catch (error) {
                console.error("Error in extractCodeFromPage:", error);
                return '// ERROR: ' + error.message;
            }
        }
        
        // Create a new tab to load the submission page
        console.log("Creating tab for submission page");
        chrome.tabs.create({ url: submissionUrl, active: false }, tab => {
            console.log("Created tab with ID:", tab.id);
            
            // Add a timeout to ensure we don't wait forever
            const timeout = setTimeout(() => {
                console.log("Timeout reached while fetching submission");
                chrome.tabs.remove(tab.id);
                reject(new Error('Timeout while fetching submission'));
            }, 20000); // 20 seconds timeout
            
            // Wait for the page to load
            chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
                if (tabId === tab.id && changeInfo.status === 'complete') {
                    console.log("Tab loaded completely");
                    
                    // Give the page a moment to finish any JavaScript execution
                    setTimeout(() => {
                        // Remove the listener
                        chrome.tabs.onUpdated.removeListener(listener);
                        clearTimeout(timeout);
                        
                        console.log("Executing script to extract code");
                        // Execute script to extract the code
                        chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            function: extractCodeFromPage
                        }, results => {
                            // Close the tab
                            chrome.tabs.remove(tab.id);
                            
                            if (chrome.runtime.lastError) {
                                console.error("Script execution error:", chrome.runtime.lastError);
                                reject(new Error(`Script execution error: ${chrome.runtime.lastError.message}`));
                                return;
                            }
                            
                            const sourceCode = results[0]?.result;
                            console.log("Source code extraction result length:", sourceCode?.length || 0);
                            
                            if (!sourceCode || sourceCode.startsWith('// EXTRACTION_FAILED') || sourceCode.startsWith('// ERROR:')) {
                                console.log("Source code extraction failed or had errors");
                                
                                // Try alternate URL format if the first one failed
                                if (submissionUrl.includes('/contest/')) {
                                    console.log("Trying alternate URL format (problemset view)");
                                    // Try with problemset view instead
                                    submissionUrl = `https://codeforces.com/problemset/submission/${submissionId}`;
                                    fetchSubmissionCode(contestId, submissionId)
                                    .then(resolve)
                                    .catch(reject);
                                    return;
                                }
                                
                                // Both URL formats failed
                                reject(new Error('Could not extract source code from submission. Please try a different solution.'));
                                return;
                            }
                            
                            console.log("Source code extracted successfully");
                            resolve(sourceCode);
                        });
                    }, 1000); // Wait 1 second for any JavaScript to finish
                }
            });
        });
    });
}