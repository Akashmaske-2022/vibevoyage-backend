const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function run() {
  const modelsToTest = ['gemini-1.5-flash', 'gemini-pro', 'gemini-1.5-pro'];
  for (const modelName of modelsToTest) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Say hello');
      console.log(`SUCCESS: ${modelName}`);
    } catch(e) {
      console.error(`FAILED: ${modelName} -> ${e.message}`);
    }
  }
}
run();
