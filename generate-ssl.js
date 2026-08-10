const selfsigned = require('selfsigned');
const fs = require('fs');

async function createCerts() {
    console.log('Generating NOEMATA SSL Certificates...');
    
    try {
        const attrs = [{ name: 'commonName', value: 'localhost' }];
        // Await the promise in newer selfsigned versions
        const pems = await selfsigned.generate(attrs, { days: 365 });

        const privateKey = pems.private || pems.key || pems.clientprivate;
        const certificate = pems.cert || pems.certificate;

        if (!privateKey || !certificate) {
            console.error('Error: Key or cert output missing from payload:', pems);
            process.exit(1);
        }

        fs.writeFileSync('key.pem', privateKey);
        fs.writeFileSync('cert.pem', certificate);

        console.log('==================================================');
        console.log('SUCCESS: key.pem and cert.pem generated!');
        console.log('==================================================');
    } catch (err) {
        console.error('Error generating SSL certificates:', err);
    }
}

createCerts();