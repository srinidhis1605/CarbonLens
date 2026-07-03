const axios = require('axios');

async function testNewRegistration() {
    try {
        console.log('Registering new user...');
        const registerResponse = await axios.post('http://localhost:3000/auth/register', {
            name: "TestUser",
            email: 'testuser@example.com',
            password: "testpass123"
        });
        console.log('✅ Registration response:', registerResponse.data);

        // Try to login
        console.log('\nLogging in...');
        const loginResponse = await axios.post('http://localhost:3000/auth/login', {
            email: 'testuser@example.com',
            password: 'testpass123'
        });
        console.log('✅ Login response:', loginResponse.data);
        
        return loginResponse.data.accessToken;
    } catch (error) {
        console.error("❌ Error:", error.response ? error.response.data : error.message);
        return null;
    }
}

testNewRegistration();
