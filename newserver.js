const express = require('express');
const app = express();
app.use(express.json());

// REEMPLAZA ÚNICAMENTE ESTA LLAVE CON TU API KEY ANON LARGA DE SUPABASE
const SUPABASE_KEY = "sb_publishable_lyN_KhNr7al-E2al0AJ-rQ__d0TfJE6";

app.get('/validar-clave', async (req, res) => {
    const { clave } = req.query;

    if (!clave) {
        return res.status(400).json({ activa: false, error: "Clave no proporcionada" });
    }

    try {
        // 1. Solicitamos los campos necesarios de la tabla licencias
        // const urlFetch = "https://supabase.co." + encodeURIComponent(clave) + "&select=activa,bloqueada,vencimiento,consultas_diarias";
        const urlBase = "https://qajwpjecppwvlfbuhhey.supabase.co/rest/v1/licencias?clave=eq.";
        const urlFetch = urlBase + encodeURIComponent(clave) + "&select=activa,bloqueada,vencimiento,consultas_diarias";
       
        const response = await fetch(urlFetch, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        // Si la clave no existe en la base de datos
        if (!data || data.length === 0) {
            return res.json({ activa: false, motivo: "Licencia inexistente" });
        }

        const registro = data[0];
        
        // OBTENEMOS LA FECHA ACTUAL DEL SERVIDOR EN FORMATO YYYY-MM-DD
        const hoy = new Date().toISOString().split('T')[0];

        // 2. CONTROL DE BLOQUEO INMEDIATO
        if (registro.bloqueada === true) {
            return res.json({ activa: false, motivo: "Licencia bloqueada por el administrador" });
        }

        // 3. CONTROL DE FECHA DE VENCIMIENTO
        if (registro.vencimiento) {
            const fechaVencimiento = new Date(registro.vencimiento).toISOString().split('T')[0];
            if (hoy > fechaVencimiento) {
                return res.json({ activa: false, motivo: "Licencia expirada" });
            }
        }

        // 4. CONTROL DE CONTADOR DE CONSULTAS DIARIAS (JSONB)
        let historial = registro.consultas_diarias || {};
        
        // Si es la primera consulta del día, inicializamos en 1, si no, le sumamos +1
        if (historial[hoy]) {
            historial[hoy] = historial[hoy] + 1;
        } else {
            historial[hoy] = 1;
        }

        // Enviamos la actualización del contador de vuelta a Supabase mediante un PATCH HTTP
        const urlUpdate = "https://supabase.co." + encodeURIComponent(clave);
        await fetch(urlUpdate, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ consultas_diarias: historial })
        });

        // 5. RESPUESTA FINAL SI TODO ESTÁ CORRECTO
        // Evaluamos si el campo general 'activa' de la tabla también es true
        if (registro.activa === true) {
            return res.json({ activa: true });
        } else {
            return res.json({ activa: false, motivo: "Licencia inactiva" });
        }

    } catch (error) {
        console.error("Error general en el servidor:", error);
        return res.status(500).json({ activa: false, error: "Error interno del servidor" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`newserver.js Servidor corriendo en el puerto ${PORT}`);
});
