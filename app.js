
const express = require('express');
const app = express();
app.use(express.json());

// Coloca aquí tu API KEY ANON LARGA de Supabase
// const SUPABASE_KEY = "TU_API_KEY_ANON_LARGA_AQUÍ";
const SUPABASE_URL = "https://qajwpjecppwvlfbuhhey.supabase.co/rest/v1/";
const SUPABASE_KEY = "sb_publishable_lyN_KhNr7al-E2al0AJ-rQ__d0TfJE6";

app.get('/validar-clave', async (req, res) => {
    const { clave } = req.query;

    if (!clave) {
        return res.status(400).json({ activa: false, error: "Clave no proporcionada" });
    }

        try {
        // CONCATENACIÓN LIFALIBLE: Inyecta dinámicamente la clave que viene de FoxPro
        const urlBase = "https://qajwpjecppwvlfbuhhey.supabase.co/rest/v1/licencias?clave=eq.";
        const urlFetch = urlBase + encodeURIComponent(clave) + "&select=activa";

        console.log("--- ¡NUEVO ARCHIVO EN ACCIÓN! ---");
        console.log("URL CONSULTADA EN SUPABASE:", urlFetch);

        const response = await fetch(urlFetch, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        console.log("Clave buscada desde VFP:", clave);
        console.log("Datos crudos de Supabase:", data);

        // Evaluamos si Supabase encontró la clave recibida
        if (data && data.length > 0) {
            // data[0].activa lee el valor verdadero/falso de la tabla
            const estadoReal = data[0].activa; 
            return res.json({ activa: estadoReal });
        } else {
            // Si la clave enviada por VFP no existe en la base de datos
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


