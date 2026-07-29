// Cambiamos app.post por app.get
app.get('/validar-clave', (req, res) => {
    // Ahora leemos la clave desde req.query en lugar de req.body
    const { clave } = req.query;

    if (!clave) {
        return res.status(400).json({ activa: false, error: "Clave no proporcionada" });
    }

    if (clavesActivas.includes(clave)) {
        return res.json({ activa: true });
    } else {
        return res.json({ activa: false });
    }
});