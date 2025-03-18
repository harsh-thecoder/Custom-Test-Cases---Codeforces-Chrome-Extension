function preprocessCodeForExecution(code, language) {
    // Make a copy of the original code
    let processedCode = code;
    
    if (language === 'cpp17' || language === 'cpp14' || language === 'c') {
        // Clean whitespace but preserve semantics
        processedCode = processedCode
            // Fix common competitive programming macro issues
            .replace(/#define\s+int\s+long\s+long([^\n])/g, '#define int long long\n$1')
            
            // Fix broken include statements
            .replace(/#include<([^>]+)>/g, '#include <$1>')
            
            // Fix spacing around namespaces
            .replace(/>\s*using\s+namespace/g, '>\n\nusing namespace')
            
            // Fix broken macro and function declarations
            .replace(/(#define\s+[^\n]+)([a-zA-Z_][a-zA-Z0-9_]*\s*\()/g, '$1\n$2')
            
            // Fix improper brace closures that lead to syntax errors
            .replace(/}([a-zA-Z_][a-zA-Z0-9_]*)/g, '}\n$1')
            
            // Ensure proper spacing around main function
            .replace(/\)\s*{/g, ') {')
            
            // Fix broken signed/unsigned main declarations
            .replace(/}(signed|unsigned|int)\s+main/g, '$1 main')
            
            // Remove non-ASCII characters that cause compilation issues
            .replace(/[^\x00-\x7F]+/g, '')
            
            // Ensure consistent newlines at end of file
            + '\n';
    }  else   if (language === 'python3' || language === 'python') {
        console.log("Original Python code length:", code.length);
        
        // If code is empty or only whitespace, provide valid Python code
        if (!processedCode.trim()) {
            console.log("Empty code detected, adding default Python code");
            return "print('No code provided or empty code detected')\n";
        }
        
        // Check for unbalanced parentheses, brackets, quotes
        let openParens = 0, openBrackets = 0, openBraces = 0;
        let inSingleQuote = false, inDoubleQuote = false;
        let escaped = false;
        
        for (let i = 0; i < processedCode.length; i++) {
            const c = processedCode[i];
            
            // Skip characters inside string literals
            if (!escaped) {
                if (c === '\\') {
                    escaped = true;
                    continue;
                }
                
                if (!inSingleQuote && !inDoubleQuote) {
                    if (c === '(') openParens++;
                    else if (c === ')') openParens--;
                    else if (c === '[') openBrackets++;
                    else if (c === ']') openBrackets--;
                    else if (c === '{') openBraces++;
                    else if (c === '}') openBraces--;
                    else if (c === "'") inSingleQuote = true;
                    else if (c === '"') inDoubleQuote = true;
                } else {
                    if (inSingleQuote && c === "'") inSingleQuote = false;
                    else if (inDoubleQuote && c === '"') inDoubleQuote = false;
                }
            } else {
                escaped = false;
            }
        }
        
        // Fix unbalanced symbols
        if (openParens > 0) processedCode += ')'.repeat(openParens);
        if (openBrackets > 0) processedCode += ']'.repeat(openBrackets);
        if (openBraces > 0) processedCode += '}'.repeat(openBraces);
        
        // Check for lines ending with colon that have no indented block
        const lines = processedCode.split('\n');
        let newLines = [];
        let expectIndent = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            newLines.push(line);
            
            // Check if this line requires indentation on the next line
            const trimmedLine = line.trim();
            if (trimmedLine && trimmedLine.endsWith(':')) {
                expectIndent = true;
            } else if (trimmedLine) {
                expectIndent = false;
            }
            
            // Check if we've reached the end and still expect indentation
            if (expectIndent && i === lines.length - 1) {
                newLines.push('    pass  # Added missing indented block');
            }
        }
        
        processedCode = newLines.join('\n');
        
        // Make sure there's at least one valid Python statement
        if (!processedCode.includes('print') && 
            !processedCode.includes('def ') && 
            !processedCode.includes('class ')) {
            processedCode += "\nprint('Code executed')\n";
        }
        
        console.log("Processed Python code:", processedCode);
        return processedCode + "\n# End of processed code\n";
    }
    
    // For other languages, use the existing preprocessing
    // [rest of your existing preprocessing code]
    
    // Add debug marker with language-appropriate comment
      else if (language === 'java') {
        // Java-specific fixes
        processedCode = processedCode
            // Fix class definitions without proper spacing
            .replace(/(class\s+[^\n{]+)\{/g, '$1 {')
            
            // Fix method definitions without proper spacing
            .replace(/(\)\s*)\{/g, '$1 {')
            
            // Ensure proper package statements
            .replace(/package([a-zA-Z])/g, 'package $1');
    }
    
    // Add debug marker to verify preprocessing
    // This is harmless in all languages as it appears as a comment
    return processedCode + "\n// Preprocessed for JDoodle\n";
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
                // In background.js, when sending simple results
                if (typeof result !== 'object') {
                    sendResponse({success: true, data: {output: result}}); 
                } else {
                    sendResponse({success: true, data: result});
                }
                sendResponse({success: true, data: result});
                // In executeJdoodleCode function
            })
            .catch(error => {
                // In background.js, when sending simple results
                if (typeof result !== 'object') {
                    sendResponse({success: true, data: {output: result}}); 
                } else {
                    sendResponse({success: true, data: result});
                }
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

function preprocessCodeForExecution(code, language) {
    if (language === "cpp" || language === "cpp17") {
        // Fix #include <bits/stdc++.h> issues
        code = code.replace(/#include\s*<bits\.stdc\+\+\.h>/g, "#include <bits/stdc++.h>\n");

        // Ensure macros are correctly formatted
        code = code.replace(/(#define\s+\w+\s*\(.*?\))(\S)/g, "$1\n$2");
        code = code.replace(/#define\s+(\w+)\(([^)]*)\)([^#\n]*)#endif/g, "#define $1($2) $3\n#endif");

        // Remove incorrectly placed `#endif`
        code = code.replace(/#endif[^\n]*\n/g, "#endif\n");

        // Replace problematic macros like Fr(i,a,b) and Fr_(i,a)
        code = code.replace(/\bFr\s*\((\w+),(\w+),(\w+)\)/g, "for(int $1=$2; $1<=$3; $1++)");
        code = code.replace(/\bFr_\s*\((\w+)\)/g, "for(auto $1 : a)");

        // Ensure main function signature is correct
        code = code.replace(/signed\s+main\s*\(/g, "int main(");

        // Fix missing semicolons after statements
        code = code.replace(/(\breturn\b[^;\n]*)\n/g, "$1;\n");

        // Fix misplaced comments that may break compilation
        code = code.replace(/\/\/([^\n]*);/g, "/*$1*/;");

        // Add missing return statement in main()
        if (!code.includes("return 0;") && code.includes("int main(")) {
            code = code.replace(/(int main\s*\(.*\)\s*{)/, "$1\n    return 0;");
        }

        // Ensure braces are balanced
        let openBraces = (code.match(/{/g) || []).length;
        let closeBraces = (code.match(/}/g) || []).length;
        if (openBraces > closeBraces) {
            let missingBraces = openBraces - closeBraces;
            let insertPosition = code.lastIndexOf("return 0;");
            if (insertPosition !== -1) {
                code = code.slice(0, insertPosition) + "}".repeat(missingBraces) + "\n" + code.slice(insertPosition);
            } else {
                code += "\n}".repeat(missingBraces);
            }
        }

        // Fix indentation (replace multiple spaces with a single space)
        code = code.replace(/[ ]{2,}/g, " ");
    }

    if (language === "python") {
        // Convert tabs to spaces (4 spaces per tab)
        code = code.replace(/\t/g, "    ");

        // Ensure missing colons in control structures
        code = code.replace(/\b(if|elif|else|for|while|def|class|try|except|finally)\s*\((.*?)\)\s*(?!:)/g, "$1 ($2):");

        // Fix missing 'self' in instance methods
        code = code.replace(/def\s+(\w+)\s*\((?!self)([^)]*)\)/g, "def $1(self, $2)");

        // Remove unnecessary semicolons at end of lines
        code = code.replace(/;\s*$/gm, "");

        // Ensure blank line before function and class definitions
        code = code.replace(/(\n\s*)(def|class)\s/g, "\n\n$1$2 ");

        // Add `if __name__ == "__main__":` if missing
        if (!code.includes("if __name__ == \"__main__\":")) {
            code += "\n\nif __name__ == \"__main__\":\n    main()";
        }
    }

    return code;
}

  
async function executeJdoodleCode(code, language, input) {
    console.log(`Executing ${language} code with JDoodle`);

    if (!code || !code.trim()) {
        return {
            output: "No code provided or empty code detected.",
            error: true
        };
    }

    const processedCode = preprocessCodeForExecution(code, language);

    console.log("Processed code sample (first 300 chars):", processedCode.substring(0, 300));

    const jdoodleEndpoint = "https://api.jdoodle.com/v1/execute";
    const clientId = "6371ffaea2318fa1252dad9359d3ac1b";  
    const clientSecret = "ca6540546cd25a26514fa79eefe9ab9a61b46680fa5b7c196d461dfa5550c395";  

    const requestBody = JSON.stringify({
        clientId,
        clientSecret,
        script: processedCode,
        language,
        versionIndex: "0",
        stdin: input
    });

    try {
        const response = await fetch(jdoodleEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                output: `Error (${response.status}): ${errorText}`,
                error: true
            };
        }

        const data = await response.json();

        if (!data.output && data.statusCode !== 200) {
            return {
                output: `Execution failed. Status code: ${data.statusCode || "unknown"}`,
                error: true
            };
        }

        let formattedOutput = `Output (${language}):\n${data.output}`;

        if (data.output.includes("error:") || data.output.includes("warning:")) {
            return {
                output: formattedOutput,
                error: true
            };
        }

        return {
            output: formattedOutput,
            error: false
        };
    } catch (error) {
        return {
            output: "Network error connecting to JDoodle API.",
            error: true
        };
    }
}




// Function to send code execution request
async function executeCode(processedCode, language, input) {
    const jdoodleEndpoint = "https://api.jdoodle.com/v1/execute";

    // Store credentials securely (move to environment variables in a real app)
    const clientId = "6371ffaea2318fa1252dad9359d3ac1b";
    const clientSecret = "ca6540546cd25a26514fa79eefe9ab9a61b46680fa5b7c196d461dfa5550c395";

    const requestBody = JSON.stringify({
        clientId,
        clientSecret,
        script: processedCode,
        language,
        versionIndex: "0",
        stdin: input
    });

    console.log("Sending request to JDoodle API...");

    try {
        const response = await fetch(jdoodleEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { output: `Error (${response.status}): ${errorText}`, error: true };
        }

        const data = await response.json();
        console.log("JDoodle API Response:", data);

        if (!data.output) {
            return { output: `Execution failed. Status code: ${data.statusCode || "unknown"}`, error: true };
        }

        let formattedOutput = `Output (${language}):\n${data.output}`;

        // Mark errors
        if (data.output.includes("error:") || data.output.includes("warning:")) {
            return { output: formattedOutput, error: true };
        }

        return { output: formattedOutput, error: false };
    } catch (error) {
        console.error("Fetch error:", error);
        return { output: "Network error connecting to JDoodle API.", error: true };
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