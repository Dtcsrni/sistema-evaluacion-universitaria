# Formato PDF y OMR

## Formato carta
- Tamaño: 216 x 279 mm (8.5 x 11 in).
- Margen seguro recomendado: 10 mm.
- Fuente limpia y alto contraste (baja tinta).

## Marcas de registro
- Lineas cortas en esquinas para correccion de perspectiva.
- Usadas por el pipeline OMR para alinear.

## QR por pagina
- QR en esquina superior derecha con quiet zone.
- Primera pagina incluye folio y pagina (ej. EXAMEN:ABC123:P1).

## Layouts
- Parcial: 2 paginas (1 hoja doble cara).
- Global: 4 paginas (2 hojas doble cara).

## Burbujas y opciones
- 5 opciones A-E con burbujas.
- Ubicacion consistente para facilitar deteccion.
- Guardar `mapaVariante` para reconstruir orden real.

## OMR pipeline
1) Detectar QR y numero de pagina.
2) Corregir perspectiva con marcas.
3) Segmentar zona de respuestas.
4) Detectar burbuja marcada.
5) Mostrar verificacion manual al docente.
