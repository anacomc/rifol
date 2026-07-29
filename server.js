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
        // 1. Construimos la URL uniendo tu subdominio real verificado paso a paso
        const urlFetch = "https://supabase.co." + encodeURIComponent(clave) + "&select=activa";

        // Imprime en la consola para confirmar que no se vuelva a recortar
        console.log("URL Final Enviada a Supabase:", urlFetch);

        // 2. Realizamos la petición HTTP a la base de datos
        const response = await fetch(urlFetch, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        // 3. Procesamos los datos recibidos
        const data = await response.json();

        console.log("Clave buscada:", clave);
        console.log("Datos crudos de Supabase:", data);

        // 4. Evaluamos la respuesta de la tabla
        if (data && data.length > 0) {
            // Extraemos la propiedad 'activa' de la primera fila encontrada
            const estadoReal = data[0].activa; 
            return res.json({ activa: estadoReal });
        } else {
            // Si la clave no existe en Supabase
            return res.json({ activa: false });
        }

    } catch (error) {
        console.error("Error conectando a Supabase:", error);
        return res.status(500).json({ activa: false, error: "Error interno del servidor" });
    }


});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`MI Servidor corriendo en el puerto ${PORT}`);
});
