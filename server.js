const express = require('express');
const app = express();

app.use(express.json());

// CONFIGURACIÓN DE SUPABASE
// Reemplaza estos dos valores con los datos reales de tu panel de Supabase
const SUPABASE_URL = "https://rfjeldbecbacfcgrkapi.supabase.co/rest/v1/";
const SUPABASE_KEY = "sb_publishable_tgD-6U5T0OWz_0dA6d6-Mw_evjNnr6D";

// Ruta GET para validar la clave desde Visual FoxPro
app.get('/validar-clave', async (req, res) => {
    const { clave } = req.query;

    if (!clave) {
        return res.status(400).json({ activa: false, error: "Clave no proporcionada" });
    }

    try {
        // Hacemos una consulta directa a la API de Supabase para buscar la clave
        const urlFetch = `${SUPABASE_URL}/rest/v1/licencias?clave=eq.${encodeURIComponent(clave)}&select=activa`;
        
        const response = await fetch(urlFetch, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        // Si la clave existe en la base de datos
        if (data && data.length > 0) {
            // Retorna el estado verdadero o falso que tenga en la tabla
            const estadoReal = data[0].activa;
            // return res.json({ activa: data[0].activa });
            return res.json({ activa: estadoReal });
        } else {
            // Si la clave ni siquiera existe
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
