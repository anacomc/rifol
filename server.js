const express = require('express'); // <-- ESTA LÍNEA FALTABA
const app = express();              // <-- ESTA LÍNEA FALTABA

app.use(express.json()); 

// Simulación de Base de Datos de claves activas
const clavesActivas = ["LICENCIA-1234", "ABCDE-56789", "FOXPRO-2026"];

// Ruta GET para validar la clave
app.get('/validar-clave', (req, res) => {
    const { clave } = req.query;

    if (!clave) {
        return res.status(400).json({ activa: false, error: "Clave no proporcionada" });
    }

    // Verificar si la clave está en nuestro registro
    if (clavesActivas.includes(clave)) {
        return res.json({ activa: true });
    } else {
        return res.json({ activa: false });
    }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
