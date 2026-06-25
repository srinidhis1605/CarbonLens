const axios = require('axios');

async function testLogin() {
    try {
        const response = await axios.post('http://localhost:3000/auth/login', {
            email: "sri@example.com", // Use the email you registered earlier
            password: "1234"
        });
        console.log("Success:", response.data.message);
    } catch (error) {
        console.error("Login Error:", error.response ? error.response.data : error.message);
    }
}

testLogin();