// config.js
const CONFIG = {
    GEMINI_API: {
      KEY: "AIzaSyCcZREIMTnhMtWf5jKvbyh_0IFkGVijRjQ"
    },
    JUDGE0_API: {
      KEY: "d4f253f796msh7c079bee49da665p190e15jsnbb56ebb405dd",
      HOST: "judge0-ce.p.rapidapi.com"
    },
    EXECUTION: {
      TIMEOUT_MS: 10000,  // Max time to wait for execution results
      MAX_ATTEMPTS: 10,   // Number of polling attempts
      POLLING_DEL AY: 1000 // Delay between polling attempts in ms
    },
    COMPILER: {
      CPP_OPTIONS: "-O2 -std=c++17"
    }
  };
  
  export default CONFIG;