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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[CF Validator] Message received in background script:', request.action);
  
  if (request.action === 'executeCode') {
    executeCodeWithJDoodle(request.code, request.language, request.input)
      .then(result => {
        console.log('[CF Validator] Code executed successfully:', result);
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('[CF Validator] Error executing code:', error);
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
  
  // Create language-specific instructions for OpenAI
  let systemPrompt = `You are a code optimization assistant specialized in ${language} programming. 
Your task is to preprocess the following code to ensure it runs correctly on an online judge system.

For Python, ensure proper input handling and output flushing with sys.stdout.flush().
For Java, make sure the main class is named 'Main'.
For C++:
  - IMPORTANT: Remove or comment out any #include statements with local file paths (like "E:\\C++\\app_debug.cpp" or any path with backslashes or drive letters)
  - Replace these with appropriate standard library includes if needed
  - Handle any includes and namespace declarations properly.

Return ONLY the optimized code without explanations or markdown formatting.`;
  
  // Include sample input if provided
  let userPrompt = `Preprocess the following ${language} code for execution:
  
  ${code}`;
  
  if (input && input.trim()) {
    userPrompt += `\n\nThe code will be tested with this input:
    
    ${input}`;
  }
  
  try {
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
        temperature: 0.2, // Lower temperature for more deterministic results
        max_tokens: 4096
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('[CF Validator] OpenAI API error:', errorData);
      // Fallback to original code if OpenAI fails
      console.log('[CF Validator] Falling back to original code preprocessing');
      return fallbackPreprocessCode(code, language);
    }
    
    const result = await response.json();
    const processedCode = result.choices[0].message.content.trim();
    
    console.log('[CF Validator] OpenAI preprocessing complete');
    
    return processedCode;
  } catch (error) {
    console.error('[CF Validator] Error in OpenAI preprocessing:', error);
    // Fallback to original preprocessing if OpenAI call fails
    console.log('[CF Validator] Falling back to original code preprocessing due to error');
    return fallbackPreprocessCode(code, language);
  }
}

// Fallback preprocessing function (original implementation)
function fallbackPreprocessCode(code, language) {
  console.log('[CF Validator] Using fallback preprocessing for language:', language);
  
  if (language === 'cpp17' || language === 'cpp14' || language === 'c') {
    // Remove local file includes
    code = code.replace(/#include\s+["<]([A-Z]:\\|\.\\|\\\\).*[">]/g, '// $&');
  }
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