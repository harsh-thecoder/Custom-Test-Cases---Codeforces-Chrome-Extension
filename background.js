// background.js
importScripts('secrets.js'); 

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "findAcceptedSolution") {
    fetchAcceptedSolution(request.contestId, request.problemId)
      .then(solution => {
        // Log the solution URL to console only
        console.log(`Solution found: ${solution.submissionUrl}`);
        console.log(`Language: ${solution.language}`);
        
        // Send response without solution URL
        sendResponse({
          sourceCode: solution.sourceCode,
          language: solution.language
        });
      })
      .catch(error => {
        console.error("Error finding solution:", error);
        sendResponse(generateFallbackSolution(request.contestId, request.problemId));
      });
    return true;
  } else if (request.action === "runTestCase") {
    processTestCase(request.problemInfo, request.input)
      .then(result => {
        if (sender.tab) {
          chrome.tabs.sendMessage(sender.tab.id, { action: "updateResult", result });
        }
        sendResponse({ success: true });
      })
      .catch(error => {
        if (sender.tab) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "updateResult", 
            result: "Error: " + error.message,
            isError: true
          });
        }
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

async function processTestCase(problemInfo, testCase) {
  try {
    const solution = await fetchAcceptedSolution(problemInfo.contestId, problemInfo.problemId);
    let outputInformation = ``;
    
    // Only log to console, not to the output string that goes to UI
    console.log(`Solution from: ${solution.submissionUrl}`);
    console.log(`Language: ${solution.language}`);
    
    try {
      const processedCode = await processWithGemini(solution.sourceCode, solution.language, GEMINI_API_KEY);
      const judge0Language = mapLanguageToJudge0(solution.language);
      const executionResult = await executeWithJudge0(processedCode, judge0Language, testCase, JUDGE0_API_KEY);
      outputInformation += executionResult.output || "No output";
      
      return outputInformation;
    } catch (geminiError) {
      const fixedCode = fixCodeForJudge0(solution.sourceCode, solution.language);
      const judge0Language = mapLanguageToJudge0(solution.language);
      const executionResult = await executeWithJudge0(fixedCode, judge0Language, testCase, JUDGE0_API_KEY);
      
      outputInformation += `${executionResult.output || "No output"}`;
      
      return outputInformation;
    }
  } catch (error) {
    throw error;
  }
}

function fixCodeForJudge0(sourceCode, language) {
  if (!language || !sourceCode) return sourceCode;
  
  const languageLower = language.toLowerCase();
  let fixedCode = sourceCode;
  
  if (languageLower.includes('c++')) {
    if (fixedCode.includes('#include <bits/stdc++.h>')) {
      fixedCode = fixedCode.replace('#include <bits/stdc++.h>', 
        `#include <iostream>
#include <vector>
#include <algorithm>
#include <map>
#include <set>
#include <string>
#include <cmath>
#include <queue>`);
    }
    
    fixedCode = fixedCode.replace(/vector<vector<int>>/g, 'vector<vector<int> >');
    fixedCode = fixedCode.replace(/^#define\s+int\s+long long.*$/m, '// #define int long long');
    
    if (fixedCode.includes('int32_t main()')) {
      fixedCode = fixedCode.replace('int32_t main()', 'int main()');
    }
    
    fixedCode = fixedCode.replace(/\/\/#define ONLINE_JUDGE.*$/m, '#define ONLINE_JUDGE');
    
    const debugPatterns = [
      /void __print.*?{.*?}/gs,
      /template<.*?>.*?void __print.*?{.*?}/gs,
      /void _print.*?{.*?}/gs,
      /template <.*?>.*?void _print.*?{.*?}/gs,
      /#ifndef ONLINE_JUDGE.*?#else.*?#endif/gs,
      /debug\(.*?\)/g
    ];
    
    for (const pattern of debugPatterns) {
      fixedCode = fixedCode.replace(pattern, '');
    }
    
    if (fixedCode.includes('const int N = 1e5 + 5') || 
        fixedCode.includes('const int N = 1e6') ||
        fixedCode.includes('const int N = 1e6 + 5')) {
      fixedCode = fixedCode.replace(/(const int N =) (1e[56](\s*\+\s*\d+)?)/g, '$1 2e4');
    }
    
    if (fixedCode.includes('#ifndef ONLINE_JUDGE')) {
      fixedCode = fixedCode.replace(/\s*#ifndef ONLINE_JUDGE.*?#endif/gs, '');
    }
  }
  
  return fixedCode;
}

async function fetchAcceptedSolution(contestId, problemId) {
  try {
    // Try multiple pages of results
    for (let page = 1; page <= 5; page++) {
      const count = 100;
      const from = (page - 1) * count + 1;
      const apiUrl = `https://codeforces.com/api/contest.status?contestId=${contestId}&from=${from}&count=${count}`;
      console.log(`Fetching solutions from API (page ${page}): ${apiUrl}`);
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      
      const data = await response.json();
      
      if (data.status !== "OK") throw new Error("Failed to fetch solutions: " + (data.comment || "Unknown error"));
      
      // Try multiple variations of the problem ID
      const problemIdVariations = [
        problemId,                                      // Original (e.g., "A")
        problemId.toUpperCase(),                        // Uppercase (e.g., "a" -> "A")
        problemId.toLowerCase(),                        // Lowercase (e.g., "A" -> "a")
        problemId.replace(/(\d+)/, ''),                 // Without numbers (e.g., "A1" -> "A")
        problemId.replace(/([A-Za-z]+)/, '')            // Only numbers (e.g., "A1" -> "1")
      ];
      
      // Log what we're looking for
      console.log(`Looking for solutions with problem index variations: ${problemIdVariations.join(', ')}`);
      
      // Try to find a solution with any of the problem ID variations
      let solution = null;
      for (const variation of problemIdVariations) {
        if (!variation) continue; // Skip empty variations
        
        solution = data.result.find(submission => {
          // Check if the submission has the "OK" verdict and matches any problem ID variation
          return submission.problem.index === variation && submission.verdict === "OK";
        });
        
        if (solution) {
          console.log(`Found solution using problem index: ${variation}`);
          break;
        }
      }
      
      // If solution found, process it
      if (solution) {
        const submissionUrl = `https://codeforces.com/contest/${contestId}/submission/${solution.id}`;
        console.log(`Found accepted solution: ${submissionUrl}`);
        
        const submissionResponse = await fetch(submissionUrl);
        
        if (!submissionResponse.ok) throw new Error(`Failed to fetch submission: HTTP ${submissionResponse.status}`);
        
        const html = await submissionResponse.text();
        let sourceCode = null;
        
        // Try multiple extraction methods
        const patterns = [
          /<pre[^>]*id="program-source-text"[^>]*>([\s\S]*?)<\/pre>/i,
          /<div[^>]*class="[^"]*source-code[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
          /<div[^>]*id="submission-source"[^>]*>[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/i
        ];
        
        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            sourceCode = decodeHtmlEntities(match[1]);
            break;
          }
        }
        
        // ACE editor content fallback
        if (!sourceCode) {
          const aceEditorMatch = html.match(/var\s+sourceCodeEditor\s*=\s*ace\.edit[^;]*;\s*sourceCodeEditor\.setValue\("([^"]*)"\)/i);
          if (aceEditorMatch && aceEditorMatch[1]) {
            sourceCode = JSON.parse('"' + aceEditorMatch[1].replace(/\\"/g, '\\"') + '"');
          }
        }
        
        // Pre tag fallback
        if (!sourceCode) {
          const allPreTags = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/gi);
          if (allPreTags && allPreTags.length > 0) {
            sourceCode = decodeHtmlEntities(allPreTags.sort((a, b) => b.length - a.length)[0]
              .replace(/<pre[^>]*>/, '').replace(/<\/pre>/, ''));
          }
        }
        
        // Try scraping directly from the submission page if API fails
        if (!sourceCode) {
          sourceCode = await scrapeSubmissionDirectly(contestId, solution.id);
        }
        
        const language = solution.programmingLanguage;
        return { sourceCode, language, submissionUrl };
      }
      
      // If we've gone through all 5 pages and found nothing, continue to the next approach
      if (page === 5 && !solution) {
        console.log("No solution found in API results, trying alternative methods");
      }
    }
    
    // If no solution found through API, try scraping from problemset status
    console.log("Trying to find solution through problemset status page");
    return await findSolutionFromProblemsetStatus(contestId, problemId);
    
  } catch (error) {
    console.error("Error in fetchAcceptedSolution:", error);
    
    // Try the fallback method before giving up completely
    try {
      console.log("Trying fallback solution finder...");
      return await findSolutionFromProblemsetStatus(contestId, problemId);
    } catch (fallbackError) {
      console.error("Fallback solution finder also failed:", fallbackError);
      throw new Error("Error finding solution: " + error.message);
    }
  }
}

// Helper function to scrape a solution directly from the problem status page
async function findSolutionFromProblemsetStatus(contestId, problemId) {
  try {
    // First, try the problemset status page
    const statusUrl = `https://codeforces.com/problemset/status/${contestId}/problem/${problemId}?order=BY_VERDICT_ASC`;
    console.log(`Scraping solutions from status page: ${statusUrl}`);
    
    const response = await fetch(statusUrl);
    if (!response.ok) throw new Error(`Status page HTTP error ${response.status}`);
    
    const html = await response.text();
    
    // Find submission IDs from the status page
    const submissionIdRegex = /data-submission-id="(\d+)"/g;
    const matches = [...html.matchAll(submissionIdRegex)];
    
    // Find accepted submissions (with "Accepted" class)
    const acceptedSubmissionRegex = /data-submission-id="(\d+)"[\s\S]*?submissionVerdict--accepted/g;
    const acceptedMatches = [...html.matchAll(acceptedSubmissionRegex)];
    
    // Prioritize accepted submissions
    const submissionIds = acceptedMatches.length > 0 
      ? acceptedMatches.map(match => match[1]) 
      : matches.map(match => match[1]);
    
    if (submissionIds.length === 0) {
      throw new Error("No submissions found on status page");
    }
    
    console.log(`Found ${submissionIds.length} submissions, ${acceptedMatches.length} are accepted`);
    
    // Try each submission until we find one with code
    for (const submissionId of submissionIds.slice(0, 5)) { // Try the first 5 submissions
      try {
        const submissionUrl = `https://codeforces.com/contest/${contestId}/submission/${submissionId}`;
        console.log(`Trying submission: ${submissionUrl}`);
        
        const submissionResponse = await fetch(submissionUrl);
        if (!submissionResponse.ok) continue;
        
        const submissionHtml = await submissionResponse.text();
        
        // Extract source code
        const codeMatch = submissionHtml.match(/<pre[^>]*id="program-source-text"[^>]*>([\s\S]*?)<\/pre>/i);
        if (!codeMatch || !codeMatch[1]) continue;
        
        const sourceCode = decodeHtmlEntities(codeMatch[1]);
        if (!sourceCode || sourceCode.trim() === "") continue;
        
        // Extract language
        const langMatch = submissionHtml.match(/Programming language:[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        const language = langMatch && langMatch[1] ? langMatch[1].trim() : "C++";
        
        return { sourceCode, language, submissionUrl };
      } catch (err) {
        console.warn(`Error processing submission ${submissionId}:`, err);
        continue;
      }
    }
    
    // If we still couldn't find a solution, try scraping from the "Recent Actions" section
    return await scrapeFromRecentActions(contestId, problemId);
    
  } catch (error) {
    console.error("Error in findSolutionFromProblemsetStatus:", error);
    throw new Error("Could not find any submissions for this problem");
  }
}

// Helper function to scrape from recent actions section on Codeforces
async function scrapeFromRecentActions(contestId, problemId) {
  try {
    // Try the problem page itself, which might have "Recent Actions" with accepted solutions
    const problemUrl = `https://codeforces.com/problemset/problem/${contestId}/${problemId}`;
    console.log(`Scraping from problem page: ${problemUrl}`);
    
    const response = await fetch(problemUrl);
    if (!response.ok) throw new Error(`Problem page HTTP error ${response.status}`);
    
    const html = await response.text();
    
    // Find recent actions with "Accepted" status
    const recentActionsRegex = /submission\/(\d+)[^>]*>[\s\S]*?submissionVerdictAccepted/g;
    const actionMatches = [...html.matchAll(recentActionsRegex)];
    
    if (actionMatches.length === 0) {
      throw new Error("No accepted submissions found in recent actions");
    }
    
    // Try each submission from recent actions
    for (const match of actionMatches.slice(0, 3)) {
      try {
        const submissionId = match[1];
        const submissionUrl = `https://codeforces.com/contest/${contestId}/submission/${submissionId}`;
        console.log(`Trying recent action submission: ${submissionUrl}`);
        
        const submissionResponse = await fetch(submissionUrl);
        if (!submissionResponse.ok) continue;
        
        const submissionHtml = await submissionResponse.text();
        
        // Extract source code
        const codeMatch = submissionHtml.match(/<pre[^>]*id="program-source-text"[^>]*>([\s\S]*?)<\/pre>/i);
        if (!codeMatch || !codeMatch[1]) continue;
        
        const sourceCode = decodeHtmlEntities(codeMatch[1]);
        if (!sourceCode || sourceCode.trim() === "") continue;
        
        // Extract language
        const langMatch = submissionHtml.match(/Programming language:[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        const language = langMatch && langMatch[1] ? langMatch[1].trim() : "C++";
        
        return { sourceCode, language, submissionUrl };
      } catch (err) {
        console.warn(`Error processing recent action submission:`, err);
        continue;
      }
    }
    
    // If all else fails, use the improved fallback solution
    throw new Error("Could not find any usable source code");
    
  } catch (error) {
    console.error("Error in scrapeFromRecentActions:", error);
    return generateImprovedFallbackSolution(contestId, problemId);
  }
}

// Direct scraping from submission page
async function scrapeSubmissionDirectly(contestId, submissionId) {
  try {
    const submissionUrl = `https://codeforces.com/contest/${contestId}/submission/${submissionId}`;
    console.log(`Directly scraping submission: ${submissionUrl}`);
    
    const response = await fetch(submissionUrl);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    
    const html = await response.text();
    
    // Try different ways to extract the code
    const methods = [
      { regex: /<pre[^>]*id="program-source-text"[^>]*>([\s\S]*?)<\/pre>/i, name: "pre#program-source-text" },
      { regex: /<div[^>]*class="[^"]*source-code[^"]*"[^>]*>([\s\S]*?)<\/div>/i, name: "div.source-code" },
      { regex: /<pre[^>]*class="[^"]*prettyprint[^"]*"[^>]*>([\s\S]*?)<\/pre>/i, name: "pre.prettyprint" },
      { regex: /<pre[^>]*>([\s\S]*?)<\/pre>/i, name: "pre" }
    ];
    
    for (const method of methods) {
      const match = html.match(method.regex);
      if (match && match[1] && match[1].trim() !== "") {
        console.log(`Extracted code using ${method.name}`);
        return decodeHtmlEntities(match[1]);
      }
    }
    
    throw new Error("Could not extract source code from submission page");
  } catch (error) {
    console.error("Error in scrapeSubmissionDirectly:", error);
    return null;
  }
}

function decodeHtmlEntities(html) {
  if (!html) return "";
  
  const entities = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' '
  };
  
  let decoded = html;
  for (const entity in entities) {
    decoded = decoded.replace(new RegExp(entity, 'g'), entities[entity]);
  }
  
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  return decoded;
}

async function processWithGemini(sourceCode, language, apiKey) {
  const prompt = `
Remove all comments from this code.  
You are a specialized code converter focused on making code run correctly on Judge0's online compiler. Your task is to convert code to be 100% compatible with Judge0's environment while preserving exact functionality.
LANGUAGE DETECTION
I want you to remove all the part from code which has never used in the code.
CRITICAL JUDGE0 COMPATIBILITY ISSUES TO FIX
FOR C++:

Replace non-standard headers:

#include <bits/stdc++.h> → individual standard headers
Include only what's needed: <iostream>, <vector>, <map>, etc.


Fix template syntax for older C++ compilers:

Change vector<vector<int>> → vector<vector<int> >
Add space between > characters in ALL nested templates


Replace auto keywords:

Change auto it = upper_bound(...) → explicit type like vector<int>::iterator it = upper_bound(...)
Replace ALL auto variables with explicit types


Expand ALL macros:

#define endl "\\n"; → replace all endl with "\\n"
#define yes cout << "YES" << endl; → replace with cout << "YES" << "\\n";
#define fast ... → expand directly in code


Replace typedefs:

typedef long long int ll; → use long long directly everywhere
Find and replace ALL instances of custom types


Fix endl usage:

Replace all endl with "\\n"
Be careful about semicolons in macros like #define endl "\\n";

Fix int32_t main to just int main.

Don't use code from comments, and remove all debugging statements such as #ifndef ONLINE_JUDGE

If code uses #define int long long int, replace it with just using long long instead of int directly.

Reduce any large array sizes to avoid memory issues, particularly if N > 10^5.


FOR PYTHON:

Make Python 3 compatible:

Fix print statements: print x → print(x)
Fix integer division: ensure / behavior is as expected
Replace raw_input() with input()


Remove dependencies:

Replace numpy, pandas, etc. with standard library alternatives
Handle file operations in a Judge0-compatible way
FOR JAVA:
Fix class naming:
Main class must be named Main for Judge0
Remove package declarations
Import only needed packages
Fix Scanner usage:
Always close Scanner objects with sc.close()
Use appropriate methods for input
FOR JAVASCRIPT:
Replace Node.js-specific code:
Replace file system operations with Judge0's input method
Implement processData function for input handling

Now convert the given code to be 100% Judge0 compatible:
${sourceCode}
  `;
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192
        }
      })
    });
    
    if (!response.ok) throw new Error(`Gemini API HTTP error: ${response.status}`);
    
    const data = await response.json();
    let extractedText = "";
    
    if (data.candidates && data.candidates.length > 0 && 
        data.candidates[0].content && data.candidates[0].content.parts && 
        data.candidates[0].content.parts.length > 0) {
      extractedText = data.candidates[0].content.parts[0].text || "";
    } else if (data.result && data.result.output) {
      extractedText = data.result.output;
    } else if (data.text) {
      extractedText = data.text;
    } else if (typeof data === 'string') {
      extractedText = data;
    }
    
    if (!extractedText || extractedText.trim() === "") {
      throw new Error("No valid content from Gemini API");
    }
    
    let cleanCode = extractedText;
    
    if (cleanCode.startsWith("```") && cleanCode.endsWith("```")) {
      cleanCode = cleanCode.replace(/^```[\w]*\n/, '').replace(/```$/, '');
    }
    
    return cleanCode;
  } catch (error) {
    throw new Error(`Gemini API error: ${error.message}`);
  }
}

async function executeWithJudge0(sourceCode, language, input, apiKey) {
  try {
    if (!apiKey || !sourceCode || sourceCode.trim() === "") {
      throw new Error(apiKey ? "Source code is empty" : "Judge0 API key is missing");
    }
    
    const safeInput = input || "";
    
    const createResponse = await fetch('https://judge0-ce.p.rapidapi.com/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': JUDGE0_API_HOST
      },
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: language,
        stdin: safeInput,
        wait: false,
        cpu_time_limit: 5,
        memory_limit: 256000,
        compile_options: "-O2 -std=c++17"
      })
    });
    
    if (!createResponse.ok) {
      let errorText = "Unknown error";
      try {
        errorText = await createResponse.text();
      } catch (e) {
        errorText = createResponse.statusText;
      }
      throw new Error(`Judge0 API error (${createResponse.status}): ${errorText}`);
    }
    
    const createData = await createResponse.json();
    const token = createData.token;
    
    if (!token) throw new Error("Failed to create submission: No token received");
    
    let result = null;
    let attempts = 0;
    const maxAttempts = 10;
    const pollingDelay = 1000;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollingDelay));
      
      const statusResponse = await fetch(`https://judge0-ce.p.rapidapi.com/submissions/${token}?fields=stdout,stderr,status_id,status,time,memory,compile_output,message`, {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': JUDGE0_API_HOST
        }
      });
      
      if (!statusResponse.ok) {
        attempts++;
        continue;
      }
      
      const statusData = await statusResponse.json();
      
      if (statusData.status && statusData.status.id > 2) {
        result = {
          output: statusData.stdout || statusData.compile_output || statusData.message || "No output",
          time: statusData.time,
          memory: statusData.memory,
          status: statusData.status
        };
        
        if (statusData.stderr) {
          result.output = `Error: ${statusData.stderr}\n\n${result.output}`;
        }
        
        break;
      }
      
      attempts++;
    }
    
    if (!result) throw new Error("Execution timed out waiting for Judge0 response");
    
    return result;
  } catch (error) {
    throw error;
  }
}

function mapLanguageToJudge0(language) {
  if (!language) return 54; // Default to C++
  
  const languageLower = language.toLowerCase();
  
  const mappings = {
    'c++': 54,
    'c': 50,
    'java': 62,
    'python 3': 71,
    'pypy 3': 71,
    'python': 70,
    'pypy': 70,
    'javascript': 63,
    'node': 63,
    'rust': 73,
    'go': 60,
    'ruby': 72,
    'php': 68,
    'c#': 51,
    'csharp': 51
  };
  
  for (const [key, value] of Object.entries(mappings)) {
    if (languageLower.includes(key)) return value;
  }
  
  return 54; // Default to C++
}

function generateImprovedFallbackSolution(contestId, problemId) {
  console.log(`Using improved fallback solution for contest ${contestId}, problem ${problemId}`);
  
  const language = "C++";
  const submissionUrl = `https://codeforces.com/contest/${contestId}/problem/${problemId}`;
  
  // More adaptive fallback solution that at least tries to parse the input
  const sourceCode = `
#include <iostream>
#include <vector>
#include <algorithm>
#include <string>
#include <map>
#include <set>
#include <queue>
#include <sstream>
using namespace std;

// Improved fallback solution that tries to handle common input formats
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    // Read all input
    vector<string> lines;
    string line;
    while (getline(cin, line)) {
        if (!line.empty()) {
            lines.push_back(line);
        }
    }
    
    cout << "Input Analysis:" << endl;
    
    // Check if first line might contain number of test cases
    bool hasMultipleTests = false;
    int numTests = 0;
    if (!lines.empty()) {
        stringstream ss(lines[0]);
        if (ss >> numTests && numTests > 0 && numTests <= 100) {
            hasMultipleTests = true;
            cout << "Detected " << numTests << " test cases." << endl;
        }
    }
    
    // Try to detect input format
    if (lines.size() >= 2) {
        cout << "First line: " << lines[0] << endl;
        cout << "Second line: " << lines[1] << endl;
        
        // Try to parse first line as integers
        stringstream ss(lines[0]);
        vector<int> firstLineInts;
        int x;
        while (ss >> x) {
            firstLineInts.push_back(x);
        }
        
        if (!firstLineInts.empty()) {
            cout << "First line contains " << firstLineInts.size() << " integers: ";
            for (int i = 0; i < min(5, (int)firstLineInts.size()); i++) {
                cout << firstLineInts[i] << " ";
            }
            if (firstLineInts.size() > 5) cout << "...";
            cout << endl;
        }
    }
    
    // Analyze all lines for patterns
    map<int, int> wordCountFrequency;
    for (const string& line : lines) {
        stringstream ss(line);
        string word;
        int words = 0;
        while (ss >> word) words++;
        wordCountFrequency[words]++;
    }
    
    // Output the most common line format
    int maxFreq = 0;
    int commonWords = 0;
    for (const auto& [words, freq] : wordCountFrequency) {
        if (freq > maxFreq) {
            maxFreq = freq;
            commonWords = words;
        }
    }
    
    if (maxFreq > 1) {
        cout << "Most common line format: " << commonWords << " word(s) per line (" << maxFreq << " lines)" << endl;
    }
    
    cout << "\\nNote: Unable to solve this problem automatically. This is a diagnostic output.\\n";
    cout << "Try using the actual solution button on the Codeforces problem page." << endl;
    
    return 0;
}`;

  return { sourceCode, language, submissionUrl };
}