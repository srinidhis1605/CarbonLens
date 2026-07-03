const axios = require('axios');

async function testAnalysis() {
    try {
        // First login to get token
        console.log('Step 1: Logging in...');
        const loginResponse = await axios.post('http://localhost:3000/auth/login', {
            email: 'testuser@example.com',
            password: 'testpass123'
        });
        const token = loginResponse.data.accessToken;
        console.log('✅ Got token:', token.substring(0, 20) + '...');

        // Now test analysis endpoint
        console.log('\nStep 2: Submitting analysis request...');
        const analysisResponse = await axios.post('http://localhost:3000/analysis', 
            { url: 'https://www.example.com' },
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        console.log('✅ Analysis response received!');
        console.log('Database Record ID:', analysisResponse.data.DATABASE_RECORD_ID);
        console.log('Carbon Score:', analysisResponse.data.PHASE_2_ENVIRONMENTAL_RECONSTRUCTION.RECONSTRUCTED_METRICS.CARBON_EFFICIENCY_SCORE);
        
    } catch (error) {
        console.error("❌ Error:", error.response?.data || error.message);
        if (error.response?.status) {
            console.error("Status Code:", error.response.status);
        }
    }
}

testAnalysis();
