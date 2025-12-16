const bcrypt = require('bcrypt');

// Replace with your actual password
const password = 'yourStrongPasswordHere';

// Generate hash with salt rounds of 12 (more secure)
const hash = bcrypt.hashSync(password, 12);

console.log('Password:', password);
console.log('Generated Hash:', hash);
console.log('\nAdd this to your .env file:');
console.log(`ADMIN_USERNAME=admin`); // change the admin to the username you want
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
