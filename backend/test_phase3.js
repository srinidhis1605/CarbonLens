const axios = require('axios');

async function testPhase3() {
    try {
        // Login
        console.log('Step 1: Logging in...');
        const loginResponse = await axios.post('http://localhost:3000/auth/login', {
            email: 'testuser@example.com',
            password: 'testpass123'
        });
        const token = loginResponse.data.accessToken;
        console.log('✅ Got token\n');

        // Test analysis endpoint
        console.log('Step 2: Submitting analysis request...');
        const analysisResponse = await axios.post('http://localhost:3000/analysis', 
            { url: 'https://www.google.com' },
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        console.log('\n=== FULL RESPONSE ===\n');
        console.log(JSON.stringify(analysisResponse.data, null, 2));
        
        console.log('\n=== PHASE 3 CHECK ===');
        if (analysisResponse.data.PHASE_3_SPEED_METRICS_TRANSCRIPT) {
            console.log('✅ Phase 3 FOUND:');
            console.log(JSON.stringify(analysisResponse.data.PHASE_3_SPEED_METRICS_TRANSCRIPT, null, 2));
        } else {
            console.log('❌ Phase 3 NOT FOUND in response');
        }
        
    } catch (error) {
        console.error("❌ Error:", error.response?.data || error.message);
    }
}

testPhase3();
