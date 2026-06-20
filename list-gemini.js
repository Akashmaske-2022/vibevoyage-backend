const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
  .then(res => res.json())
  .then(data => {
    if (data.models) {
       console.log(data.models.map(m => m.name).filter(n => n.includes('gemini')));
    } else {
       console.log(data);
    }
  }).catch(console.error);
