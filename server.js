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
        // 1. Definimos la URL de consulta directa usando tu subdominio real verificado
        // Esto elimina cualquier error de duplicación o barras extras al inicio del archivo
        const urlFetch = `https://supabase.co{encodeURIComponent(clave)}&select=activa`;
        
        // 2. Realizamos la petición HTTP a la base de datos
        const response = await fetch(urlFetch, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        // Líneas de diagnóstico en la consola de Render
        console.log("Clave buscada:", clave);
        console.log("Datos crudos de Supabase:", data);

        // 3. Evaluamos la respuesta de la tabla
        if (data && data.length > 0) {
            // Extraemos la propiedad 'activa' del primer registro encontrado [0]
            const estadoReal = data[0].activa; 
            return res.json({ activa: estadoReal });
        } else {
            // Si la clave no existe en la tabla de Supabase
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
