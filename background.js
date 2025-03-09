// background.js

// Add this function to your background.js file
function preprocessCodeForExecution(code, language) {
    // Make a copy of the original code
    let processedCode = code;
    
    if (language === 'cpp17' || language === 'cpp14' || language === 'c') {
        // Fix common C++ formatting issues
        
        // First handle potentially missing spaces after #include directives
        processedCode = processedCode.replace(/#include<([^>]+)>/g, '#include <$1>');
        
        // Add proper spacing around 'using namespace' declaration
        processedCode = processedCode.replace(/>#include/g, '>\n#include');
        processedCode = processedCode.replace(/>using/g, '>\nusing');
        
        // Add newlines after semicolons that aren't in quotes or comments
        processedCode = processedCode.replace(/;(?=([^"']*["'][^"']*["'])*[^"']*$)(?!\/\/)/g, ';\n');
        
        // Fix #define statements that are run together
        processedCode = processedCode.replace(/(#define [^#]+)#define/g, '$1\n#define');
        
        // Remove non-standard ASCII characters that might cause compilation issues
        processedCode = processedCode.replace(/[^\x00-\x7F]+/g, '');
        
        // Add newlines around braces for better readability
        processedCode = processedCode.replace(/{(?=([^"']*["'][^"']*["'])*[^"']*$)/g, '{\n');
        processedCode = processedCode.replace(/}(?=([^"']*["'][^"']*["'])*[^"']*$)/g, '\n}');
        
        // Fix any multiple consecutive newlines
        processedCode = processedCode.replace(/\n{3,}/g, '\n\n');
    } else if (language === 'python3' || language === 'python') {
        // For Python, make sure indentation is proper
        if (!processedCode.includes('\n') && (processedCode.includes(':') || processedCode.includes('def ') || processedCode.includes('class '))) {
            // Add newlines after colons not in strings
            processedCode = processedCode
                .replace(/:(?=([^"']*["'][^"']*["'])*[^"']*$)/g, ':\n  ')
                // Add newlines before def or class
                .replace(/(def |class )/g, '\n$1');
        }
    }
    
    return processedCode;
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
// Function to execute code with JDoodle
// Update this function in your background.js file
async function executeJdoodleCode(code, language, input) {
    console.log(`Executing ${language} code with JDoodle`);
    
    // Preprocess the code for better formatting before sending
    const processedCode = preprocessCodeForExecution(code, language);
    
    // Debug: Log a sample of the processed code
    console.log("Processed code sample (first 300 chars):", processedCode.substring(0, 300));
    
    const jdoodleEndpoint = 'https://api.jdoodle.com/v1/execute';
    const clientId = 'f5813c60373beca24a2ebab22dfd746'; 
    const clientSecret = '4f7bfffa4f7f289857bc2b27c48dc1307ff13fd48a5a79511bc8225c75c38009';
    
    // Prepare request body
    const requestBody = JSON.stringify({
        clientId, 
        clientSecret, 
        script: processedCode,
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
                console.error("JDoodle returned 500 error");
                return { 
                    output: "The code execution service returned an error (500). This may be due to:\n" +
                            "- API usage limits\n- Service temporarily unavailable\n- Invalid code or input",
                    error: true 
                };
            }
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error("JDoodle error response:", errorText);
                return { 
                    output: `Code execution service error (${response.status}): ${errorText}`,
                    error: true 
                };
            }
            
            const data = await response.json();
            
            console.log("JDoodle raw response:", JSON.stringify(data));
            
            // Make sure the 'output' field exists before returning
            if (!data.output && data.statusCode !== 200) {
                console.error("JDoodle execution failed:", data);
                return { 
                    output: "Error: JDoodle execution failed. Status code: " + (data.statusCode || "unknown"),
                    error: true 
                };
            }
            
            // Compile errors should be displayed but marked as errors
            if (data.output && (data.output.includes("error:") || data.output.includes("warning:"))) {
                data.error = true;
            }
            
            // Ensure there's always an output property
            if (!data.output) {
              data.output = "No output returned from code execution service";
            }
            
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
                            
                            console.log("JDoodle raw response (XHR):", JSON.stringify(data));
                            
                            // Make sure the 'output' field exists before returning
                            if (!data.output && data.statusCode !== 200) {
                              resolve({ 
                                  output: "Error: JDoodle execution failed. Status code: " + (data.statusCode || "unknown"),
                                  error: true 
                              });
                              return;
                            }
                            
                            // Compile errors should be displayed but marked as errors
                            if (data.output && (data.output.includes("error:") || data.output.includes("warning:"))) {
                                data.error = true;
                            }
                            
                            // Ensure there's always an output property
                            if (!data.output) {
                              data.output = "No output returned from code execution service";
                            }
                            
                            resolve(data);
                        } catch (parseError) {
                            resolve({ 
                                output: `Error parsing response: ${xhr.responseText.substring(0, 100)}...`,
                                error: true 
                            });
                        }
                    } else if (xhr.status === 500) {
                        resolve({ 
                            output: "The code execution service returned an error (500). This may be due to:\n" +
                                    "- API usage limits\n- Service temporarily unavailable\n- Invalid code or input",
                            error: true 
                        });
                    } else {
                        resolve({ 
                            output: `Code execution service error (${xhr.status}): ${xhr.responseText}`,
                            error: true 
                        });
                    }
                };
                
                xhr.onerror = function() {
                    resolve({ 
                        output: "Network error connecting to code execution service. " +
                                "This might be due to CORS restrictions or network connectivity issues.",
                        error: true 
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
                    "- API rate limits\n- Invalid API credentials",
            error: true 
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
                
                // Method 4: Check for the Codeforces submission viewer format
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
                
                // Method 5: Last resort - look for any elements with class containing "source"
                if (!sourceCode) {
                    const sourceElements = Array.from(document.querySelectorAll('*'))
                    .filter(elem => elem.className && typeof elem.className.includes === 'function' && 
                            (elem.className.includes('source') || (elem.id && elem.id.includes('source'))));
                    
                    for (const elem of sourceElements) {
                        if (elem.textContent && elem.textContent.trim().length > 10) { // Basic validation
                            console.log("Found code using elements with 'source' in class/id");
                            sourceCode = elem.textContent;
                            break;
                        }
                    }
                }
                
                // If we found code, do basic validation and cleanup
                if (sourceCode) {
                    // Clean up the code
                    sourceCode = sourceCode.trim();
                    
                    // Fix common issues with C++ code
                    if (sourceCode.includes('#include')) {
                        // Handle potentially mangled #include statements
                        sourceCode = sourceCode.replace(/#include<([^>]+)>/g, '#include <$1>');
                        
                        // Fix missing newlines between multiple #include statements
                        sourceCode = sourceCode.replace(/(#include\s*<[^>]+>)(?=#include)/g, '$1\n');
                        
                        // Fix missing newlines before using namespace
                        sourceCode = sourceCode.replace(/(>)(?=\s*using\s+namespace)/g, '$1\n');
                        
                        // Fix mangled #define statements
                        sourceCode = sourceCode.replace(/#define([^#]+)(?=#define)/g, '#define$1\n');
                    }
                    
                    // Remove non-ASCII characters
                    sourceCode = sourceCode.replace(/[^\x00-\x7F]+/g, '');
                    
                    // Check if it looks like code (contains common programming constructs)
                    const codeIndicators = ['(', ')', '{', '}', ';', '=', 'return', 'if', 'for', 'while', 'int', 'void', '#include', 'def ', 'class '];
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
                
                // As a last resort, look for any large text block
                const allElements = document.querySelectorAll('*');
                let longestText = '';
                
                for (const elem of allElements) {
                    if (elem.textContent && elem.textContent.trim().length > longestText.length) {
                        const text = elem.textContent.trim();
                        // Check if this might be code
                        if (text.includes('{') && text.includes('}') && text.includes('(') && text.includes(')')) {
                            longestText = text;
                        }
                    }
                }
                
                if (longestText.length > 50) {
                    console.log("Falling back to longest text block that might be code");
                    return longestText;
                }
                
                // Nothing worked, return an error indicator
                return '// EXTRACTION_FAILED\n// Could not find code in the page';
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