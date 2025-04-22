import fetch from 'node-fetch';

async function testLogin() {
  try {
    console.log('Testing login API with testuser...');
    
    const response = await fetch('http://localhost:5000/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'testuser',
        password: 'password123',
      }),
    });
    
    const result = await response.json();
    
    console.log('Login API Response Status:', response.status);
    console.log('Login API Response Body:', result);
    
    if (response.ok) {
      console.log('✅ Login successful!');
    } else {
      console.log('❌ Login failed:', result.message);
    }
  } catch (error) {
    console.error('Error testing login API:', error);
  }
}

testLogin();