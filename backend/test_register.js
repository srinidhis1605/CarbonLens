const axios = require('axios');

const PORT = process.env.PORT || 3000;

async function testRegister() {
    try {
        const response = await axios.post(`http://localhost:${PORT}/auth/register`, {
            name: "Sri",
            email: 'sri@example.com',
            password: "1234"
        });
        console.log(response.data);
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error(`Error: No server running on port ${PORT}. Start it with: node server.js`);
        } else {
            console.error("Error:", error.response ? error.response.data : error.message);
        }
    }
}

testRegister();