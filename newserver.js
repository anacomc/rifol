const express = require('express');
const app = express();
app.use(express.json());

// API KEY ANON LARGA DE SUPABASE
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_HOME = process.env.SUPABASE_HOME;
const SUPABASE_HIST = process.env.SUPABASE_HISTORIAL;
const SUPABASE_MAST = process.env.SUPABASE_MASTER;
const SUPABASE_DISP = process.env.SUPABASE_DISPONIBLES;
const SUPABASE_ACTI = process.env.SUPABASE_ACTIVADAS;  


//*********************************************************************************************************
// =====================================================================
// NUEVA RUTA RAÍZ (/): AHORA LA URL LIMPIA SÍ SIFRA Y DESPIERTA SUPABASE
// =====================================================================
app.get('/', async (req, res) => {
    try {
        // Usamos exactamente tu misma lógica de urlBase de la Parte 1
        const urlBase = SUPABASE_HOME + "?clave=eq.";
        
        // Hacemos una consulta tonta de limit=1 para forzar el movimiento de PostgreSQL
        const urlDespertador = urlBase + "clave_despertador" + "&select=clave&limit=1";

        const response = await fetch(urlDespertador, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log("¡ÉXITO! Supabase despertado desde la raíz limpia por visita web.");
            return res.status(200).send("Servidor Activo y Base de Datos de Supabase Despierta.");
        } else {
            return res.status(500).send("Servidor responde, pero Supabase dio alerta.");
        }

    } catch (error) {
        return res.status(500).send("Error de comunicación: " + error.message);
    }
});

//*********************************************************************************************************

app.get('/validar-clave', async (req, res) => {
    const { clave } = req.query;

    if (!clave) {
        return res.status(400).json({ activa: false, error: "Clave no proporcionada" });
    }

    try {
        // 1. Solicitamos los campos necesarios de la tabla licencias
        const urlBase = SUPABASE_HOME + "?clave=eq.";
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
        // --- NUEVO: OBTENEMOS LA HORA ACTUAL EN FORMATO HH:MM:SS ---
        const hora = new Date().toTimeString().split(' ')[0];        

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
            // C) ¡LA IDEA FABULOSA!: Insertamos un registro de auditoría en la nueva tabla historial_accesos
            const urlHistorial = SUPABASE_HIST;
            await fetch(urlHistorial, {
                method: 'POST', // POST sirve para insertar filas nuevas
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': "Bearer " + SUPABASE_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ 
                    clave: clave,
                    rif: rifCliente,
                    ip: ipCliente,
                    hora: hora
                    // La columna 'fecha' se llena sola en Supabase con la fecha actual
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
        let urlFetch = SUPABASE_HOME + "?";
        
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
// =================================================================
// NUEVA RUTA: AUDITORÍA COMPLETA (TRAE EL HISTORIAL PLANO DE LOGS)
// =================================================================
app.get('/auditoria-completa', async (req, res) => {
    const { clave } = req.query;

    try {
        // Apuntamos directamente a la nueva tabla de logs ordenando por id descendente (los más recientes primero)
        let urlFetch = SUPABASE_HIST + "?";
        
        // Si desde FoxPro pides auditar una licencia específica, filtramos; si no, trae todo
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

        // Enviamos la lista plana de registros directamente a FoxPro
        return res.json({ logs: data });

    } catch (error) {
        console.error("Error en auditoría completa:", error);
        return res.status(500).json({ error: "Error interno" });
    }
});
// =====================================================================
// DESPERTADOR SECRETO: CONECTADO A TU URLBASE DE SUPABASE (FETCH)
// =====================================================================
app.get('/despertador-secreto-licencias', async (req, res) => {
    try {
        // --- REPARADO EN BASE A TU CÓDIGO REAL: USAMOS TU MISMA RUTA DE LA PARTE 1 ---
        const urlBase = SUPABASE_HOME+"?clave=eq.";
        
        // Consultamos un registro común (limit=1) para forzar el movimiento de la base de datos relacional
        const urlDespertador = urlBase + "clave_despertador" + "&select=clave&limit=1";

        // Ejecutamos tu estructura de comandos fetch original con tu constante SUPABASE_KEY
        const response = await fetch(urlDespertador, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        // Si la base de datos de PostgreSQL respondió de forma correcta (Códigos de éxito 2xx)
        if (response.ok) {
            console.log("¡ÉXITO! Supabase ha sido despertado de forma forzada por Cron-Job.");
            return res.status(200).send("Base de datos de Supabase Despierta y Operativa.");
        } else {
            const txtError = await response.text();
            console.error("Supabase rechazó la petición del despertador:", txtError);
            return res.status(500).send("Supabase respondió con alerta: " + txtError);
        }

    } catch (error) {
        console.error("Fallo crítico en el despertador de red:", error);
        return res.status(500).send("Error de comunicación en Render: " + error.message);
    }
});
// =====================================================================
// NUEVO ENDPOINT: REGISTRAR LICENCIA MAESTRA DESDE VISUAL FOXPRO (POST)
// =====================================================================
// =====================================================================
// CORREGIDO: REGISTRAR LICENCIA MAESTRA - BLINDAJE DE SERIAL (POST)
// =====================================================================
app.post('/registrar-master', async (req, res) => {
    const { rif, licencia, activa, bloqueada } = req.body;

    if (!rif || !licencia) {
        return res.status(400).json({ registrado: false, error: "El RIF y la Licencia (Serial) son obligatorios." });
    }

    try {
        const lcRif = rif.trim().toUpperCase();
        const lcLicencia = licencia.trim();
        console.log(`Validando propiedad de Serial único: ${lcLicencia}...`);

        // 1. INTERROGAMOS A SUPABASE PARA VER SI LA LICENCIA YA EXISTE
        const urlCheck = SUPABASE_MAST + `?licencia=eq.${encodeURIComponent(lcLicencia)}`;
        
        const responseCheck = await fetch(urlCheck, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const dataCheck = await responseCheck.json();

        // 2. EL CANDADO DE CONTROL DE PIRATERÍA CORREGIDO
        if (Array.isArray(dataCheck) && dataCheck.length > 0) {
            // --- REMACHE SEGURO: Extraemos con total precisión la fila cero ---
            const registroExistente = dataCheck[0]; 
            
            // Caso A: Es exactamente el mismo RIF con el mismo Serial (Re-registro inofensivo)
            if (registroExistente.rif === lcRif) {
                console.log(`ℹ️ El RIF ${lcRif} ya tiene asignada esta misma licencia.`);
                return res.json({ 
                    registrado: false, 
                    motivo: "DUPLICADO", 
                    error: "Esta licencia ya se encuentra asignada y activa para su empresa." 
                });
            } else {
                // Caso B: Es un RIF NUEVO intentando clonar el Serial de OTRA empresa (¡PIRATERÍA!)
                console.log(`⛔ INTENTO DE CLONACIÓN: El RIF ${lcRif} intentó usar el Serial de ${registroExistente.rif}`);
                return res.json({ 
                    registrado: false, 
                    motivo: "DUPLICADO", 
                    error: "Registro inválido. Esta licencia ya fue activada previamente por otra empresa." 
                });
            }
        }

        // 3. SI EL SERIAL ESTÁ LIBRE, SE PROCEDE A INSERTAR LA NUEVA FILA
        const payloadMaster = {
            rif: lcRif,
            licencia: lcLicencia,
            activa: activa !== undefined ? activa : true,
            bloqueada: bloqueada !== undefined ? bloqueada : false
        };

        const responseSupabase = await fetch(SUPABASE_MAST, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payloadMaster)
        });

        if (responseSupabase.ok) {
            console.log(`¡Éxito! Licencia única vinculada al RIF ${lcRif} guardada en MASTER.`);
            return res.status(200).json({ registrado: true, mensaje: "Licencia maestra creada exitosamente." });
        } else {
            const errorTxt = await responseSupabase.text();
            console.error("Supabase rechazó la inserción física:", errorTxt);
            return res.status(200).json({ registrado: false, error: "La base de datos bloqueó el registro." });
        }

    } catch (error) {
        console.error("Fallo crítico controlado en ruta registrar-master:", error);
        // Atajamos cualquier pánico de hardware y respondemos con status 200 para que VFP lea el JSON sin reventarse
        return res.status(200).json({ registrado: false, error: "Conflicto contido de datos: " + error.message });
    }
});
// =====================================================================
// ACTUALIZADO: ACTIVACIÓN ONLINE EN DOS PASOS CON CÁLCULO DE VENCIMIENTO
// =====================================================================
app.post('/activar-licencia-online', async (req, res) => {
    const { licencia, rif } = req.body;

    if (!licencia || !rif) {
        return res.status(400).json({ activada: false, error: "El Serial de Licencia y el RIF son obligatorios." });
    }

    try {
        const lcLicencia = licencia.trim();
        const lcRif = rif.trim().toUpperCase();
        console.log(`🤖 Iniciando protocolo de activación para Licencia: ${lcLicencia}...`);

        // 1. VERIFICAR QUE EL SERIAL EXISTA EN TU STOCK DE DISPONIBLES
        const urlCheckStock = process.env.SUPABASE_DISPONIBLES + `?licencia=eq.${encodeURIComponent(lcLicencia)}`;
        const responseStock = await fetch(urlCheckStock, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const dataStock = await responseStock.json();

        if (!dataStock || dataStock.length === 0 || !Array.isArray(dataStock)) {
            console.log(`❌ El Serial ${lcLicencia} no existe en el Maestro de Disponibles.`);
            return res.json({ activada: false, motivo: "INEXISTENTE", error: "El número de licencia proporcionado no es válido." });
        }

        // Extraemos tu registro real (Fila 0 de la RAM)
        const registroStock = dataStock[0]; 

        // Validamos si ya fue quemada previamente en tu stock
        if (registroStock.status === true) {
            console.log(`❌ El Serial ${lcLicencia} ya se encuentra quemado/asignado.`);
            return res.json({ activada: false, motivo: "YA_ASIGNADO", error: "Esta licencia ya fue activada previamente por otro usuario." });
        }

        // Mapeamos tu clave primaria ID (Mayúscula o Minúscula de Postgres)
        const idReal = registroStock.ID !== undefined ? registroStock.ID : registroStock.id;

        // CÁLCULO DINÁMICO DE TU FECHA DE VENCIMIENTO
        const aniosValidez = registroStock.VALIDEZ !== undefined ? parseInt(registroStock.VALIDEZ) : (registroStock.validez !== undefined ? parseInt(registroStock.validez) : 1);
        
        let fechaCalculada = new Date();
        fechaCalculada.setFullYear(fechaCalculada.getFullYear() + aniosValidez);
        const lcVencimiento = fechaCalculada.toISOString().split('T')[0];

        // 2. PROCEDER CON LA ACTIVACIÓN EN TU MAESTRO DE ACTIVADAS
        // ¡INYECTADOS TUS NUEVOS CAMPOS LÓGICOS DE CONTROL COMERCIAL!
        const payloadActivacion = {
            licencia: lcLicencia,
            rifasociado: lcRif,
            vencimiento: lcVencimiento,
            activa: true,       // Nace habilitada para operar
            bloqueada: false    // Nace libre de restricciones
        };

        const responseActi = await fetch(process.env.SUPABASE_ACTIVADAS, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payloadActivacion)
        });

        if (!responseActi.ok) {
            const errTxt = await responseActi.text();
            console.error("Supabase rechazó la inserción en activadas:", errTxt);
            return res.json({ activada: false, error: "La base de datos bloqueó la activación de hardware." });
        }

        // 3. QUEMAR EL SERIAL EN TU STOCK DE DISPONIBLES CAMBIANDO EL STATUS A TRUE
        const columnaId = registroStock.ID !== undefined ? 'ID' : 'id';
        const urlUpdateStock = process.env.SUPABASE_DISPONIBLES + `?${columnaId}=eq.${idReal}`;
        
        await fetch(urlUpdateStock, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ status: true }) // Quemado perpetuo en stock
        });

        console.log(`🚀 ¡ÉXITO MULTI-TABLA! Licencia activada legítimamente hasta el ${lcVencimiento}.`);
        return res.status(200).json({ activada: true, mensaje: `Licencia activada y registrada de forma exitosa. Vence el: ${lcVencimiento}` });

    } catch (error) {
        console.error("Fallo crítico controlado en protocolo de activación:", error);
        return res.status(200).json({ activada: false, error: "El servidor contuvo un error en la ráfaga: " + error.message });
    }
});
// =====================================================================
// DEFINITIVO: ACTIVACIÓN ONLINE MULTI-ESTACIÓN (POST PURE)
// =====================================================================
app.post('/activar-licencia-online_', async (req, res) => {
    const { licencia, rif } = req.body;

    if (!licencia || !rif) {
        return res.status(400).json({ activada: false, error: "El Serial de Licencia y el RIF son obligatorios." });
    }

    try {
        const lcLicencia = licencia.trim();
        const lcRif = rif.trim().toUpperCase();
        console.log(`🤖 Evaluando cupos multi-estación para Licencia: ${lcLicencia}, RIF: ${lcRif}...`);

        // 1. VERIFICAR QUE EL SERIAL EXISTA EN TU STOCK DE DISPONIBLES
        const urlCheckStock = process.env.SUPABASE_DISPONIBLES + `?licencia=eq.${encodeURIComponent(lcLicencia)}`;
        const responseStock = await fetch(urlCheckStock, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const dataStock = await responseStock.json();

        if (!dataStock || dataStock.length === 0 || !Array.isArray(dataStock)) {
            console.log(`❌ El Serial ${lcLicencia} no existe en el Maestro de Disponibles.`);
            return res.json({ activada: false, motivo: "INEXISTENTE", error: "El número de licencia proporcionado no es válido." });
        }

        // Extraemos tu registro real (Fila 0 de la RAM)
        const registroStock = dataStock[0]; 

        // Si el estatus general en el stock ya fue quemado a true, cortamos de inmediato
        if (registroStock.status === true) {
            console.log(`❌ El Serial ${lcLicencia} ya se encuentra totalmente agotado en cupos.`);
            return res.json({ activada: false, motivo: "YA_ASIGNADO", error: "Esta licencia ya alcanzó el máximo de activaciones permitidas." });
        }

        // Extraemos el límite de estaciones (si no existe la columna o está nula, por defecto es 1)
        const maxEstaciones = registroStock.limite_estaciones !== undefined ? parseInt(registroStock.limite_estaciones) : 1;

        // ---------------------------------------------------------------------
        // PASO EXTRA: CONTAMOS CUÁNTOS ASIENTOS YA TIENE OCUPADOS ESTE SERIAL
        // ---------------------------------------------------------------------
        const urlCountActivadas = process.env.SUPABASE_ACTIVADAS + `?licencia=eq.${encodeURIComponent(lcLicencia)}&select=count`;
        const responseCount = await fetch(urlCountActivadas, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Prefer': 'count=exact' // Forzamos conteo de hardware síncrono en Postgres
            }
        });

        const rangoCabecera = responseCount.headers.get('content-range') || "";
        let activacionesActuales = 0;
        
        if (rangoCabecera.includes('/')) {
            activacionesActuales = parseInt(rangoCabecera.split('/')[1]) || 0;
        } else {
            // Resguardo por si el API responde el JSON plano con el arreglo de filas
            const dataCountBody = await responseCount.json();
            if (Array.isArray(dataCountBody)) activacionesActuales = dataCountBody.length;
        }

        console.log(`📊 Cuota de Licencia: [${activacionesActuales} de ${maxEstaciones}] asientos ocupados.`);

        // Candado Comercial: Si ya alcanzamos o superamos la cuota, portazo por volumen
        if (activacionesActuales >= maxEstaciones) {
            console.log(`❌ Bloqueo de Cuota: Serial ${lcLicencia} excedió su límite de ${maxEstaciones} estaciones.`);
            return res.json({ activada: false, motivo: "CUOTA_EXCEDIDA", error: "Límite de activaciones alcanzado para esta licencia. Adquiera más asientos." });
        }

        // CÁLCULO DINÁMICO DE TU FECHA DE VENCIMIENTO
        const aniosValidez = registroStock.validez !== undefined ? parseInt(registroStock.validez) : 1;
        let fechaCalculada = new Date();
        fechaCalculada.setFullYear(fechaCalculada.getFullYear() + aniosValidez);
        const lcVencimiento = fechaCalculada.toISOString().split('T')[0];

        // 2. PROCEDER CON LA ACTIVACIÓN EN TU MAESTRO DE ACTIVADAS (Añadimos un asiento)
        const payloadActivacion = {
            licencia: lcLicencia,
            rifasociado: lcRif,
            vencimiento: lcVencimiento,
            activa: true,
            bloqueada: false
        };

        const responseActi = await fetch(process.env.SUPABASE_ACTIVADAS, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payloadActivacion)
        });

        if (!responseActi.ok) {
            const errTxt = await responseActi.text();
            console.error("Supabase rechazó la inserción en activadas:", errTxt);
            return res.json({ activada: false, error: "La base de datos bloqueó la activación por hardware." });
        }

        // 3. QUEMAR EL STOCK UNICAMENTE SI ACABAMOS DE LLENAR EL ULTIMO CUPO CONTRATADO
        // Sumamos 1 al contador actual porque la inserción del payload fue exitosa
        if ((activacionesActuales + 1) >= maxEstaciones) {
            const idReal = registroStock.id !== undefined ? registroStock.id : registroStock.ID;
            const urlUpdateStock = process.env.SUPABASE_DISPONIBLES + `?id=eq.${idReal}`;
            
            await fetch(urlUpdateStock, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': "Bearer " + SUPABASE_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ status: true }) // Agotada para siempre en stock
            });
            console.log(`🔒 Licencia [${lcLicencia}] agotó todos sus cupos contratados.`);
        }

        console.log(`🚀 ¡ÉXITO MULTI-ESTACIÓN! Activación registrada. Asientos: [${activacionesActuales + 1}/${maxEstaciones}]`);
        return res.status(200).json({ activada: true, mensaje: `Licencia activada de forma exitosa. Asiento asignado.` });

    } catch (error) {
        console.error("Fallo crítico controlado en protocolo de activación:", error);
        return res.status(200).json({ activada: false, error: "El servidor contuvo un error en la ráfaga: " + error.message });
    }
});

// =====================================================================
// NUEVO ENDPOINT: EMBUDO DE VALIDACIÓN DIARIA CAPTCHASOLVER (POST)
// =====================================================================
app.post('/validar-acceso-diario', async (req, res) => {
    const { licencia, rif } = req.body;

    // Validación fail-safe básica de escritorio
    if (!licencia || !rif) {
        return res.status(400).json({ acceso: false, error: "Licencia y RIF son requeridos para la validación." });
    }

    try {
        const lcLicencia = licencia.trim();
        const lcRif = rif.trim().toUpperCase();
        console.log(`📡 Solicitud de acceso diario -> Licencia: ${lcLicencia}, RIF: ${lcRif}...`);

        // ---------------------------------------------------------------------
        // PASO 1: VERIFICAR EN MAESTRO_LICENCIAS_DISPONIBLES (TU STOCK)
        // ---------------------------------------------------------------------
        const urlCheckStock = process.env.SUPABASE_DISPONIBLES + `?licencia=eq.${encodeURIComponent(lcLicencia)}`;
        const responseStock = await fetch(urlCheckStock, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const dataStock = await responseStock.json();

        // Candado A: Si no existe en el inventario o status es false (No asignada)
        if (!dataStock || dataStock.length === 0 || !Array.isArray(dataStock)) {
            console.log(`⛔ Acceso Denegado: Licencia ${lcLicencia} no existe en stock.`);
            return res.json({ acceso: false, motivo: "INEXISTENTE", error: "Licencia no válida o no ha sido dada de alta." });
        }

        const registroStock = dataStock[0];
        if (registroStock.status !== true) {
            console.log(`⛔ Acceso Denegado: Licencia ${lcLicencia} no ha sido asignada aún.`);
            return res.json({ acceso: false, motivo: "NO_ASIGNADA", error: "Esta licencia no se encuentra activada ni asignada en el sistema." });
        }

        // ---------------------------------------------------------------------
        // PASO 2: VERIFICAR EN MAESTRO_LICENCIAS_ACTIVADAS (CANDADOS CLIENTE)
        // ---------------------------------------------------------------------
        // Consultamos la tabla de activadas buscando la combinación exacta de RIF + Licencia
        const urlCheckActivadas = process.env.SUPABASE_ACTIVADAS + `?and=(licencia.eq.${encodeURIComponent(lcLicencia)},rifasociado.eq.${encodeURIComponent(lcRif)})`;
        const responseActivadas = await fetch(urlCheckActivadas, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const dataActivadas = await responseActivadas.json();

        // Candado B: ¿Existe el registro de activación para ese RIF?
        if (!dataActivadas || dataActivadas.length === 0 || !Array.isArray(dataActivadas)) {
            console.log(`⛔ Acceso Denegado: Licencia ${lcLicencia} no pertenece al RIF ${lcRif}.`);
            return res.json({ acceso: false, motivo: "RIF_INCORRECTO", error: "La licencia no se encuentra vinculada al RIF suministrado." });
        }

        const registroCliente = dataActivadas[0];

        // Candado C: ¿Está activa y NO bloqueada?
        if (registroCliente.activa !== true || registroCliente.bloqueada === true) {
            console.log(`⛔ Acceso Denegado: Licencia ${lcLicencia} se encuentra suspendida o bloqueada.`);
            return res.json({ acceso: false, motivo: "SUSPENDIDA", error: "La licencia se encuentra inactiva o bloqueada por el administrador." });
        }

        // Candado D: ¿Está vencida? (Comparación cronológica YYYY-MM-DD en la RAM)
        const hoy = new Date().toISOString().split('T');
        if (registroCliente.vencimiento) {
            const fechaVencimiento = new Date(registroCliente.vencimiento).toISOString().split('T');
            if (hoy > fechaVencimiento) {
                console.log(`⛔ Acceso Denegado: Licencia ${lcLicencia} expiró el ${fechaVencimiento}.`);
                return res.json({ acceso: false, motivo: "VENCIDA", error: "La licencia se encuentra vencida. Por favor, renueve su suscripción." });
            }
        }

        // ---------------------------------------------------------------------
        // PASO 3: REPARADO - REGISTRAMOS EN TU TABLA HISTORIAL_DE_ACCESOS
        // ---------------------------------------------------------------------
        // Capturamos la IP real del cliente a través de las cabeceras de Render
        const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "0.0.0.0";

        const payloadAcceso = {
            licencia: lcLicencia,
            rifasociado: lcRif,
            ipaddress: ipCliente
            // La columna 'fechahoraacceso' se llena sola en Supabase con now() por hardware
        };

        console.log(`📡 Disparando registro binario de IP hacia: ${process.env.SUPABASE_ACCESOS}`);

        // --- EL REMACHE DEFINITIVO: Clavamos la variable exacta con la S al final ---
        const responseLog = await fetch(process.env.SUPABASE_ACCESOS, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payloadAcceso)
        });

        if (responseLog.ok) {
            console.log(`✅ Acceso concedido y bitácora guardada para Licencia: ${lcLicencia}, IP: ${ipCliente}`);
            return res.status(200).json({ acceso: true, mensaje: "Validación exitosa. Licencia vigente y autorizada." });
        } else {
            const errLogTxt = await responseLog.text();
            console.error("❌ Supabase rechazó la inserción en el historial:", errLogTxt);
            return res.json({ acceso: false, error: "Acceso concedido, pero la base de datos rechazó el registro de bitácora." });
        }

    } catch (error) {
        console.error("Fallo crítico en protocolo de validación diaria:", error);
        return res.status(200).json({ acceso: false, error: "El servidor contuvo un error en la ráfaga: " + error.message });
    }
});

            




//**************************************************************************************************************************************
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`newserver.js 4. Servidor corriendo en el puerto ${PORT}`);
});
