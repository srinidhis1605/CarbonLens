const axios = require('axios');

async function testSeoAudit() {
    try {
        // First login to get token
        console.log('Step 1: Logging in...');
        const loginResponse = await axios.post('http://localhost:3000/auth/login', {
            email: 'testuser@example.com',
            password: 'testpass123'
        });
        const token = loginResponse.data.accessToken;
        console.log('✅ Got token:', token.substring(0, 20) + '...');

        // Now test SEO audit endpoint with analysis_id 68
        console.log('\nStep 2: Submitting SEO audit request...');
        const seoResponse = await axios.post('http://localhost:3000/analysis/seo-audit', 
            { 
                url: 'https://www.example.com',
                analysis_id: 68
            },
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        console.log('✅ SEO audit response received!');
        console.log('Database Record ID:', seoResponse.data.DATABASE_RECORD_ID);
        console.log('SEO Metrics:', JSON.stringify(seoResponse.data.SEO_METRICS_REPORT, null, 2).substring(0, 200) + '...');
        
    } catch (error) {
        console.error("❌ Error:", error.response?.data || error.message);
        if (error.response?.status) {
            console.error("Status Code:", error.response.status);
        }
    }
}

testSeoAudit();
