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
        
        // ¡TRUCO DE INVISIBILIDAD!: Si NO es una consulta de reporte, sumamos +1 y actualizamos Supabase
        if (req.query.reporte !== "true") {
            
            // Si es la primera consulta del día, inicializamos en 1, si no, le sumamos +1
            if (historial[hoy]) {
                historial[hoy] = historial[hoy] + 1;
            } else {
                historial[hoy] = 1;
            }
            // CAPTURA AUTOMÁTICA DE IP Y RIF
            // req.headers['x-forwarded-for'] toma la IP de internet real del cliente a través de Render
            const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const rifCliente = req.query.rif || "No proporcionado";
            
            // Enviamos la actualización del contador de vuelta a Supabase
            // const urlUpdate = "https://qajwpjecppwvlfbuhhey.supabase.co." + encodeURIComponent(clave);
            // const urlBase   = "https://qajwpjecppwvlfbuhhey.supabase.co/rest/v1/licencias?clave=eq.";
            // const urlUpdate = "https://qajwpjecppwvlfbuhhey.supabase.co/rest/v1/licencias?clave=eq." + encodeURIComponent(clave) ;
            const urlUpdate = urlBase + encodeURIComponent(clave) ;
            await fetch(urlUpdate, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': "Bearer " + SUPABASE_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                // ¡AQUÍ SUMAMOS LOS NUEVOS CAMPOS PARA ACTUALIZAR EN SUPABASE!
                body: JSON.stringify({ 
                    consultas_diarias: historial,
                    ultima_ip: ipCliente,
                    rif_empresa: rifCliente
                })
            });
        }

        // 5. RESPUESTA FINAL SI TODO ESTÁ CORRECTO
        // Evaluamos si el campo general 'activa' de la tabla también es true
       //  POR ESTE BLOQUE INTEGRAL PARA REPORTES:
       if (registro.activa === true) {
            
            // 1. Tomamos el objeto consultas_diarias (ej: {"2026-07-30":51})
            const historialCrudo = registro.consultas_diarias || {};
            
            // 2. Lo transformamos en un arreglo estructurado [{fecha: "...", cantidad: ...}]
            const arregloFormateado = Object.entries(historialCrudo).map(([fechaKey, cantidadValue]) => {
                return {
                    fecha: fechaKey,
                    cantidad: cantidadValue
                };
            });

            // 3. Enviamos el JSON con el nuevo diseño limpio
            return res.json({ 
                activa: true, 
                vencimiento: registro.vencimiento, 
                bloqueada: registro.bloqueada, 
                consultas_diarias: arregloFormateado 
            });
} else {
    return res.json({ activa: false, motivo: "Licencia inactiva" });
}

    } catch (error) {
        console.error("Error general en el servidor:", error);
        return res.status(500).json({ activa: false, error: "Error interno del servidor" });
    }
});
// ************************************************************************************************************
// =================================================================
// NUEVA RUTA: REPORTE GENERAL (TRAE ACTIVAS, INACTIVAS, UNA O TODAS)
// =================================================================
app.get('/reporte-general', async (req, res) => {
    const { clave } = req.query; // Si viene vacía, traerá todas

    try {
        // 1. Construimos la URL de Supabase de forma inteligente
        let urlFetch = "https://qajwpjecppwvlfbuhhey.supabase.co/rest/v1/licencias?";
        
        // Si el usuario especificó una clave en FoxPro, filtramos solo esa; si no, trae todas
        if (clave) {
            urlFetch += "&clave=eq." + encodeURIComponent(clave);
        }

        const response = await fetch(urlFetch, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        // 2. Procesamos y formateamos el arreglo de registros (uno o muchos)
        const resultadoFinal = data.map(registro => {
            const historialCrudo = registro.consultas_diarias || {};
            
            // Transformamos el objeto consultas_diarias a tu arreglo deseado [{fecha, cantidad}]
            const arregloFormateado = Object.entries(historialCrudo).map(([fechaKey, cantidadValue]) => {
                return {
                    fecha: fechaKey,
                    cantidad: cantidadValue
                };
            });

            // Devolvemos el registro completo sin importar si activa es true o false
            return {
                clave: registro.clave,
                activa: registro.activa,
                bloqueada: registro.bloqueada,
                vencimiento: registro.vencimiento,
                consultas_diarias: arregloFormateado
            };
        });

        // 3. Respondemos con la lista de licencias procesadas
        return res.json({ licencias: resultadoFinal });

    } catch (error) {
        console.error("Error en reporte general:", error);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
});
// *********************************************************************************************
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`newserver.js Servidor corriendo en el puerto ${PORT}`);
});
