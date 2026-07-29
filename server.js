const express = require('express');
const app = express();
app.use(express.json());

// REEMPLAZA ÚNICAMENTE ESTA LLAVE CON TU API KEY ANON LARGA DE SUPABASE
const SUPABASE_KEY = "TU_API_KEY_ANON_LARGA_AQUÍ";

app.get('/validar-clave', async (req, res) => {
    const { clave } = req.query;

    if (!clave) {
        return res.status(400).json({ activa: false, error: "Clave no proporcionada" });
    }

    try {
        // Forzamos la dirección absoluta y correcta directamente en una sola línea de texto
        const urlFetch = "https://supabase.co." + encodeURIComponent(clave) + "&select=activa";

        console.log("URL REAL EJECUTADA POR EL SERVIDOR:", urlFetch);

        const response = await fetch(urlFetch, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        console.log("Clave buscada:", clave);
        console.log("Datos crudos de Supabase:", data);

        if (data && data.length > 0) {
            const estadoReal = data[0].activa; 
            return res.json({ activa: estadoReal });
        } else {
            return res.json({ activa: false });
        }

    } catch (error) {
        console.error("Error conectando a Supabase:", error);
        return res.status(500).json({ activa: false, error: "Error interno del servidor" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
