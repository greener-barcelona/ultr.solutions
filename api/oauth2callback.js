export default async function handler(req, res) {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).send("No se recibió código de autorización");
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Código de Autorización</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          max-width: 600px; 
          margin: 50px auto; 
          padding: 20px;
          background: #f5f5f5;
        }
        .code-box {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        code {
          display: block;
          background: #f0f0f0;
          padding: 15px;
          border-radius: 4px;
          word-break: break-all;
          font-size: 14px;
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <div class="code-box">
        <h2>✅ Autorización exitosa</h2>
        <p>Copia este código:</p>
        <code>${code}</code>
        <p><strong>Úsalo en tu terminal local con getToken.js</strong></p>
      </div>
    </body>
    </html>
  `);
}