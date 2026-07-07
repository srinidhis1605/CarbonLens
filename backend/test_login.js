const axios = require('axios');

async function testLogin() {
    try {
        const response = await axios.post('http://localhost:5000/auth/login', {
            email: "sri@example.com", // Use the email you registered earlier
            password: "1234"
        });
        console.log("Success! Access Token:", response.data.accessToken);
    } catch (error) {
        console.error("Login Error:", error.response ? error.response.data : error.message);
    }
}

testLogin();