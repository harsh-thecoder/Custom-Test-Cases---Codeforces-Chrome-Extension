// background.js
console.log('[CF Validator] Background script initialized');

// Initialize global variables to hold API credentials
let JDOODLE_CLIENT_ID = '';
let JDOODLE_CLIENT_SECRET = '';
let JDOODLE_API_URL = 'https://api.jdoodle.com/v1/execute';
let OPENAI_API_KEY = '';
let OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Load configuration on extension initialization
async function loadConfig() {
  try {
    console.log('[CF Validator] Loading configuration...');
    
    // Fetch the config file
    const response = await fetch(chrome.runtime.getURL('config.json'));
    
    if (!response.ok) {
      throw new Error(`Failed to load config: ${response.status} ${response.statusText}`);
    }
    
    const config = await response.json();
    console.log('[CF Validator] Configuration loaded successfully');
    
    // Set the credentials from config
    JDOODLE_CLIENT_ID = config.jdoodle.clientId;
    JDOODLE_CLIENT_SECRET = config.jdoodle.clientSecret;
    OPENAI_API_KEY = config.openai.apiKey;
    
    console.log('[CF Validator] API credentials configured');
  } catch (error) {
    console.error('[CF Validator] Error loading configuration:', error);
  }
}

// Load config when the extension starts
loadConfig();
// Handle messages from content script
// In your background.js, modify the message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[CF Validator] Message received in background script:', request.action);
    
    if (request.action === 'executeCode') {
      // Use a Promise chain to handle the entire flow
      preprocessCodeWithOpenAI(request.code, request.language, request.input)
        .then(processedCode => {
          // Instead of sending an early response, pass along the processed code
          return executeCodeWithJDoodle(processedCode, request.language, request.input)
            .then(result => {
              // Send a complete response once everything is done
              sendResponse({ 
                success: true, 
                data: result,
                debug: true, 
                processedCode: processedCode
              });
            });
        })
        .catch(error => {
          console.error('[CF Validator] Error in execution chain:', error);
          sendResponse({ success: false, error: error.message });
        });
      
      return true; // Keep the messaging channel open for async response
    }
});

// Execute code using JDoodle API
async function executeCodeWithJDoodle(code, language, input) {
  console.log('[CF Validator] Executing code with JDoodle:', { language, codeLength: code.length });
  
  // Preprocess code using OpenAI
  try {
    const processedCode = await preprocessCodeWithOpenAI(code, language, input);
    
    // Prepare request payload
    const payload = {
      clientId: JDOODLE_CLIENT_ID,
      clientSecret: JDOODLE_CLIENT_SECRET,
      script: processedCode,
      language: mapToJDoodleLanguage(language),
      versionIndex: getJDoodleVersionIndex(language),
      stdin: input
    };
    
    console.log('[CF Validator] JDoodle request payload:', { 
      language: payload.language, 
      versionIndex: payload.versionIndex,
      inputLength: input.length
    });
    
    const response = await fetch(JDOODLE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    console.log('[CF Validator] JDoodle API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[CF Validator] JDoodle API error:', errorText);
      throw new Error(`JDoodle API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('[CF Validator] JDoodle execution result:', result);
    
    // Check for JDoodle API errors
    if (result.error) {
      throw new Error(`JDoodle execution error: ${result.error}`);
    }
    
    return {
      output: result.output,
      statusCode: result.statusCode,
      memory: result.memory,
      cpuTime: result.cpuTime
    };
  } catch (error) {
    console.error('[CF Validator] Error in executeCodeWithJDoodle:', error);
    throw error;
  }
}

// Preprocess code using OpenAI API
async function preprocessCodeWithOpenAI(code, language, input) {
    console.log('[CF Validator] Preprocessing code with OpenAI for language:', language);
    
    // Create an even more robust system prompt with stronger emphasis on syntax correctness
    let systemPrompt = `You are a code simplification expert specialized in competitive programming, particularly for Codeforces problems in ${language}.
  Your task is to convert the given code into a MINIMAL, CLEAN, and SYNTACTICALLY CORRECT version that will run correctly on an online judge system.
  
  ABSOLUTE REQUIREMENTS (These must be followed precisely):
  1. ELIMINATE ALL DEBUG CALLS - Remove any function calls containing 'debug' completely
  2. Remove ALL debugging headers, includes, and macros
  3. Remove ALL #ifndef ONLINE_JUDGE sections and their contents completely
  4. Remove any code that exists SOLELY for debugging purposes
  5. ENSURE THE CODE IS SYNTACTICALLY CORRECT - No empty preprocessor directives, no syntax errors
  6. Convert template code and competitive programming boilerplate to minimal essential code
  7. Preserve the EXACT algorithm logic and solution approach
  
  SIMPLIFICATIONS TO MAKE:
  - Keep only necessary header includes (replace <bits/stdc++.h> with specific needed headers)
  - Remove macros and typedefs that aren't used in the solution
  - Remove empty preprocessor directives completely
  - Ensure all preprocessor directives are complete and valid
  - Simplify complex template constructs while ensuring correctness
  
  IMPORTANT: Double-check the code for syntax errors before returning it. The code MUST compile without errors.
  
  Return ONLY the clean, minimal code without any explanations, comments, or markdown formatting.`;
    
    let userPrompt = `Convert this ${language} Codeforces solution to a minimal, clean, and syntactically correct version suitable for an online judge:
    
  ${code}
  
  CRITICAL: Make sure there are no syntax errors, empty preprocessor directives, or other issues that would prevent compilation.`;
    
    if (input && input.trim()) {
      userPrompt += `\n\nThe code will be tested with this input:
      
  ${input}`;
    }
    
    try {
      console.log('[CF Validator] Sending request to OpenAI...');
      
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: userPrompt
            }
          ],
          temperature: 0.1 // Low temperature for deterministic results
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[CF Validator] OpenAI API error:', errorData);
        console.log('[CF Validator] Falling back to enhanced manual preprocessing');
        return enhancedManualPreprocessing(code, language);
      }
      
      const result = await response.json();
      const processedCode = result.choices[0].message.content.trim();
      
      // Log the processed code from OpenAI
      console.log('[CF Validator] Code returned from OpenAI:');
      console.log(processedCode);
      
      // Enhanced check for any issues
      const hasDebugElements = /\bdebug\s*\(|\bdebug\b|debug\.h/.test(processedCode);
      const hasEmptyDirectives = /#define\s*$|#include\s*$|#ifdef\s*$|#ifndef\s*$|#endif\s*$/.test(processedCode);
      
      console.log(`[CF Validator] Issues found: Debug elements: ${hasDebugElements}, Empty directives: ${hasEmptyDirectives}`);
      
      // If issues are detected, apply enhanced manual preprocessing
      if (hasDebugElements || hasEmptyDirectives) {
        console.log('[CF Validator] Applying enhanced manual preprocessing');
        return enhancedManualPreprocessing(processedCode, language);
      }
      
      return processedCode;
    } catch (error) {
      console.error('[CF Validator] Error in OpenAI preprocessing:', error);
      console.log('[CF Validator] Falling back to enhanced manual preprocessing due to error');
      return enhancedManualPreprocessing(code, language);
    }
}

// Enhanced manual preprocessing function
function enhancedManualPreprocessing(code, language) {
    console.log('[CF Validator] Performing enhanced manual preprocessing');
    
    // Remove any debug function calls completely
    code = code.replace(/\bdebug\s*\([^)]*\);?/g, '');
    
    // Remove debug header includes
    code = code.replace(/#include\s+["<]debug\.h[">].*$/gm, '');
    
    // Remove #ifndef ONLINE_JUDGE sections
    code = code.replace(/#ifndef\s+ONLINE_JUDGE[\s\S]*?#else([\s\S]*?)#endif/gm, '$1');
    code = code.replace(/#ifndef\s+ONLINE_JUDGE[\s\S]*?#endif/gm, '');
    
    // Remove debug define macros
    code = code.replace(/#define\s+debug\s*\(.*\).*$/gm, '');
    
    // Remove empty preprocessor directives
    code = code.replace(/#define\s*$/gm, '');
    code = code.replace(/#include\s*$/gm, '');
    code = code.replace(/#ifdef\s*$/gm, '');
    code = code.replace(/#ifndef\s*$/gm, '');
    code = code.replace(/#endif\s*$/gm, '');
    
    // Replace bits/stdc++.h with common essential headers for C++
    if (language === 'cpp17' || language === 'cpp14' || language === 'c') {
      const hasBitsStdc = /#include\s+<bits\/stdc\+\+\.h>/.test(code);
      if (hasBitsStdc) {
        code = code.replace(/#include\s+<bits\/stdc\+\+\.h>/, 
          '#include <iostream>\n#include <vector>\n#include <algorithm>\n#include <string>\n#include <cmath>\n#include <map>\n#include <set>');
      }
    }
    
    console.log('[CF Validator] Enhanced manual preprocessing complete');
    return code;
}
// Fallback preprocessing function (original implementation)
function fallbackPreprocessCode(code, language) {
    console.log('[CF Validator] Using fallback preprocessing for language:', language);
    
    if (language === 'cpp17' || language === 'cpp14' || language === 'c') {
      // Remove local file includes with paths
      code = code.replace(/#include\s+["<]([A-Z]:\\|\.\\|\\\\).*[">]/g, '// $&');
      
      // Also comment out potentially custom headers that aren't standard
      const standardHeaders = ['iostream', 'vector', 'string', 'algorithm', 'map', 'set', 'unordered_map', 
                             'unordered_set', 'queue', 'stack', 'deque', 'list', 'cmath', 'numeric',
                             'utility', 'cstdio', 'cstdlib', 'cstring', 'cctype', 'cassert', 'functional'];
      
      // Look for includes that don't match standard patterns
      code = code.replace(/#include\s+["<]([\w\.]+)[">]/g, (match, header) => {
        // If it's a standard header, keep it
        if (standardHeaders.includes(header) || header.endsWith('.h') && standardHeaders.includes(header.slice(0, -2))) {
          return match;
        }
        // Otherwise comment it out
        return `// ${match} // Removed by CF Validator`;
      });
    }
    
    // Rest of the function remains the same...
    // Handle specific language preprocessing here
    if (language === 'python3') {
      // For Python, make sure it flushes output
      if (!code.includes('import sys') && !code.includes('sys.stdout.flush')) {
        return "import sys\n" + code + "\nsys.stdout.flush()";
      }
    }
    
    // For Java, we might need to modify the class name to Main
    if (language === 'java') {
      // Check if the code has a class definition that's not Main
      const classMatch = code.match(/\bclass\s+(\w+)\b/);
      if (classMatch && classMatch[1] !== 'Main') {
        // Replace the class name with Main
        code = code.replace(/\bclass\s+(\w+)\b/, 'class Main');
      }
    }
    
    return code;
  }
// Map our language codes to JDoodle's language codes
function mapToJDoodleLanguage(language) {
  const mapping = {
    'cpp17': 'cpp17',
    'cpp14': 'cpp14',
    'python3': 'python3',
    'java': 'java',
    'c': 'c',
    'nodejs': 'nodejs'
  };
  
  return mapping[language] || language;
}

// Get appropriate version index for JDoodle
function getJDoodleVersionIndex(language) {
  // JDoodle version indices
  const versionIndices = {
    'cpp17': '0',  // GCC 9.1.0
    'cpp14': '3',  // GCC 8.1.0
    'python3': '4', // Python 3.10.0
    'java': '4',   // JDK 17.0.1
    'c': '4',      // GCC 10.2.0
    'nodejs': '4'  // Node 17.0.1
  };
  
  return versionIndices[language] || '0';
}