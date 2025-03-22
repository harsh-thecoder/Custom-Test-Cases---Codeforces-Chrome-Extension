// background.js
console.log('[CF Validator] Background script initialized');

// JDoodle API credentials
const JDOODLE_CLIENT_ID = '6371ffaea2318fa1252dad9359d3ac1b';
const JDOODLE_CLIENT_SECRET = 'ca6540546cd25a26514fa79eefe9ab9a61b46680fa5b7c196d461dfa5550c395';
const JDOODLE_API_URL = 'https://api.jdoodle.com/v1/execute';

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
  
  // Preprocess code based on language if needed
  const processedCode = preprocessCode(code, language);
  
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
  
  try {
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

// Preprocess code if needed based on language
function preprocessCode(code, language) {
  console.log('[CF Validator] Preprocessing code for language:', language);
  
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