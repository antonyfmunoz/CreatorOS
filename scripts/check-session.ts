import fetch from 'node-fetch';

async function checkSession() {
  try {
    console.log('Checking current user session...');
    
    const response = await fetch('http://localhost:5000/api/user', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include' // This won't actually work since node-fetch doesn't support cookies
    });
    
    const result = await response.json();
    
    console.log('Session check status:', response.status);
    
    if (response.ok) {
      console.log('✅ User is authenticated!');
      console.log('Current user:', result);
    } else {
      console.log('❌ User is not authenticated');
      console.log('Error:', result.message);
    }
  } catch (error) {
    console.error('Error checking session:', error);
  }
}

checkSession();