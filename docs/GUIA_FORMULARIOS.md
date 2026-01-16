# Guía para llenar formularios (UI)

Esta guía describe **cómo llenar cada formulario** del sistema (plataforma docente y portal alumno), qué significa cada campo y qué validaciones aplica.

> Nota: algunos comportamientos (como políticas de correo institucional) dependen de variables de entorno. Si tu institución impone dominios permitidos, verás mensajes de validación cuando el correo no cumpla.

---

## Convenciones generales

- **Fechas**: los campos `Fecha inicio`/`Fecha fin` usan selector de fecha del navegador y se envían como `YYYY-MM-DD`.
- **Campos requeridos**: si un botón aparece deshabilitado, normalmente falta un campo obligatorio o hay un error de validación.
- **Listas desplegables**: debes elegir una opción válida (p. ej. `Periodo`, `Alumno`).
- **Selección múltiple** (Plantillas → Preguntas):
  - Windows: `Ctrl` + clic para seleccionar varias preguntas.
  - También puedes usar `Shift` + clic para rangos.
- **Mensajes**:
  - `error`: el formulario no se pudo completar (o el servidor rechazó el dato).
  - `info`: aviso / instrucción.
  - `ok`: acción completada.

---

## Plataforma Docente

### Acceso docente (Ingresar / Registrar)

Pantalla: **Acceso docente**.

#### Ingresar
Campos:
- **Correo** (requerido): correo del docente.
  - Si hay política de dominios, debe ser institucional (por ejemplo `@universidad.edu`).
- **Contrasena** (requerido): contraseña actual.

Cómo llenarlo:
1) Escribe tu correo.
2) Escribe tu contraseña.
3) Presiona **Ingresar**.

Errores comunes:
- **Correo no permitido**: usa el dominio institucional admitido.
- **Correo o contrasena incorrectos**: revisa que el correo sea el mismo con el que te registraste.

#### Ingresar con Google (si está habilitado)
- Usa el botón de Google.
- Si hay política de dominios, solo funcionará para correos permitidos.

#### Registrar
Campos:
- **Nombres** (requerido)
- **Apellidos** (requerido)
- **Correo** (requerido)
  - Si registras con Google, el correo puede quedar **bloqueado** (tomado de Google).
- **Contrasena**
  - En registro con correo/contraseña: requerida.
  - En registro con Google: puede ser **opcional** (puedes definirla después en “Cuenta”).

Cómo llenarlo (recomendado):
1) Presiona **Registrar**.
2) Si está disponible, usa **Google** para autocompletar correo.
3) Completa nombres/apellidos.
4) (Opcional) activa **Crear contrasena ahora** y define una contraseña (mínimo 8 caracteres).
5) Presiona **Crear cuenta**.

#### Recuperar contrasena con Google (si aplica)
Esta opción aparece cuando el acceso con Google está habilitado.

Campos:
- **Nueva contrasena** (mínimo 8 caracteres).

Cómo llenarlo:
1) Abre **Recuperar contrasena con Google**.
2) Reautentica con Google.
3) Escribe la nueva contraseña.
4) Presiona **Actualizar contrasena**.

---

### Cuenta (Definir o cambiar contrasena)

Sección: **Cuenta**.

Objetivo: establecer o cambiar la contraseña del docente.

Campos:
- **Contrasena actual** (solo si tu cuenta ya tiene contraseña definida).
- **Nueva contrasena** (requerido, mínimo 8 caracteres).
- **Confirmar contrasena** (requerido, debe coincidir).
- **Reautenticación**:
  - Si tu cuenta tiene Google vinculado, puedes reautenticar con Google (recomendado).

Cómo llenarlo:
1) Si está disponible, reautentica con Google.
2) (Si corresponde) escribe tu contraseña actual.
3) Escribe la nueva contraseña y confírmala.
4) Presiona **Guardar contrasena**.

---

### Banco de preguntas (Crear pregunta)

Sección: **Banco** → “Banco de preguntas”.

Campos:
- **Enunciado** (requerido): el texto completo de la pregunta.
- **Tema** (requerido): categoría o unidad (ej. “Unidad 1: Integrales”).
- **Opciones A–E** (todas requeridas): texto de cada opción.
- **Correcta** (requerido): selecciona cuál opción es la correcta.

Recomendaciones:
- Mantén opciones claras y no ambiguas.
- Evita opciones vacías: el botón **Guardar** se habilita cuando todas tienen texto.

---

### Periodos (Crear periodo)

Sección: **Periodos**.

Campos:
- **Nombre** (requerido): nombre del periodo (ej. “2026-1”, “Enero-Junio 2026”).
- **Fecha inicio** (requerido)
- **Fecha fin** (requerido)
  - Debe ser **igual o posterior** a la fecha inicio.
- **Grupos (separados por coma)** (opcional): lista de grupos.
  - Ejemplos: `A1,B1,C2` o `3A,3B`.

Cómo llenarlo:
1) Escribe el nombre del periodo.
2) Selecciona fecha inicio y fecha fin.
3) (Opcional) escribe grupos separados por coma.
4) Presiona **Crear periodo**.

---

### Alumnos (Crear alumno)

Sección: **Alumnos**.

Campos:
- **Matricula** (requerido): identificador del alumno (ej. `2024-001`).
- **Nombres** (requerido)
- **Apellidos** (requerido)
- **Correo** (opcional)
  - Si hay política de dominios permitidos, debe ser institucional.
- **Grupo** (opcional): grupo/sección (ej. `3A`).
- **Periodo** (requerido): periodo al que pertenece.

Cómo llenarlo:
1) Captura matrícula, nombres y apellidos.
2) Selecciona el periodo.
3) (Opcional) captura correo y grupo.
4) Presiona **Crear alumno**.

---

### Plantillas (Crear plantilla)

Sección: **Plantillas**.

Campos:
- **Titulo** (requerido): nombre de la plantilla (ej. “Parcial 1 – Álgebra”).
- **Tipo** (requerido):
  - `Parcial` o `Global`.
- **Periodo** (requerido)
- **Total reactivos** (requerido): número entero ≥ 1.
- **Preguntas** (requerido): selecciona una o más preguntas (selección múltiple).

Cómo llenarlo:
1) Define título, tipo y periodo.
2) Ajusta total de reactivos.
3) Selecciona preguntas (usa `Ctrl` + clic para varias).
4) Presiona **Crear plantilla**.

Notas:
- Si el total de reactivos es mayor que tu banco/selección efectiva, el backend puede limitar o fallar según reglas internas.

---

### Generación de examen (PDF)

Sección: **Plantillas** → “Generar examen”.

Campos:
- **Plantilla** (requerido): plantilla base.
- **Alumno (opcional)**: si seleccionas alumno, el examen queda asociado.

Cómo llenarlo:
1) Selecciona la plantilla.
2) (Opcional) selecciona el alumno.
3) Presiona **Generar**.

Qué obtienes:
- Se genera un examen con un **folio** y PDF con **QR por página**.
- Ese **folio** se usa luego en “Recepción” y “Escaneo OMR”.

---

### Recepción de exámenes (Vincular entrega)

Sección: **Recepcion de examenes**.

Objetivo: asociar un folio (examen entregado) a un alumno.

Campos:
- **Folio** (requerido): folio del examen (proviene del PDF/QR).
- **Alumno** (requerido): el alumno dueño del folio.

Cómo llenarlo:
1) Captura el folio tal como aparece en el examen.
2) Selecciona el alumno.
3) Presiona **Vincular**.

---

### Escaneo OMR (Analizar imagen y revisar respuestas)

Sección: **Escaneo OMR**.

Campos:
- **Folio** (requerido): folio del examen.
- **Pagina** (requerido): número de página (inicia en 1).
- **Imagen** (requerido): archivo de imagen (`.jpg`, `.png`, etc.) con la hoja escaneada/fotografiada.

Cómo llenarlo:
1) Captura el folio.
2) Indica la página.
3) Sube la imagen.
4) Presiona **Analizar**.

Después del análisis:
- Verás **Respuestas detectadas** con su porcentaje de confianza.
- Puedes **corregir manualmente** cada respuesta usando el selector `A–E` o dejar `-` si está en blanco.
- Si hay **advertencias**, se muestran en un bloque de alerta (por ejemplo: QR no detectado, baja confianza, etc.).

Recomendaciones para la imagen:
- Buena iluminación, sin sombras fuertes.
- Imagen recta (evita inclinación), sin cortes en los bordes.
- Resolución suficiente para que el QR y burbujas sean legibles.

---

### Calificar examen

Sección: **Calificar examen**.

Requisitos previos:
- Haber corrido “Escaneo OMR” (para que exista `Examen` y `Alumno` en pantalla).

Campos:
- **Bono (max 0.5)**: decimal entre 0 y 0.5.
- **Evaluacion continua (parcial)**: número ≥ 0.
- **Proyecto (global)**: número ≥ 0.

Cómo llenarlo:
1) Verifica que aparezcan **Examen** y **Alumno** (si no, regresa a Escaneo).
2) Define bono/evaluación continua/proyecto según aplique.
3) Presiona **Calificar**.

---

### Publicar en portal (Resultados + código de acceso)

Sección: **Publicar en portal**.

Objetivo:
- Publicar resultados del periodo en el portal alumno.
- Generar un **código de acceso** para que estudiantes consulten.

Campos:
- **Periodo** (requerido): el periodo a publicar.

Acciones:
- **Publicar**: envía resultados del periodo al portal.
- **Generar codigo**: crea un código temporal para acceso de alumnos.

Qué debes compartir con alumnos:
- El **código generado**.
- Su **matrícula** (la que registraste en “Alumnos”).

---

## Portal Alumno (Consulta de resultados)

Pantalla: **Resultados de examen**.

### Ingresar / Consultar

Campos:
- **Codigo de acceso** (requerido)
  - Formato recomendado: 4–12 caracteres alfanuméricos.
  - Ejemplo: `ABC123`.
- **Matricula** (requerido)
  - 3–20 caracteres (letras/números/guion).
  - Ejemplo: `2024-001`.

Cómo llenarlo:
1) Pega o escribe el **código de acceso** que te dio el docente.
2) Escribe tu **matrícula**.
3) Presiona **Consultar**.

### Ver PDF
- En “Resultados disponibles”, presiona **Ver PDF** para abrir el examen en una pestaña nueva.

### Recargar
- Si no ves resultados inmediatamente después de ingresar, usa **Recargar**.

---

## Checklist rápido (si algo falla)

- ¿Ya creaste el **Periodo** antes de crear alumnos/plantillas?
- ¿Ya hay **preguntas** en el banco antes de crear plantillas?
- ¿El **folio** que estás usando coincide con el examen (PDF/QR)?
- En OMR: ¿la **página** corresponde a la hoja escaneada?
- En portal alumno: ¿el periodo fue **publicado** y el código está vigente?
