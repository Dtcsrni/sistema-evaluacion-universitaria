/*Script para formularios POE*/
/*-Estado: listaReactivos*/
/*-Validacion: cantidad mínima de preguntas y formularios no vacios*/
/*Handlers o escuchadores de eventos*/
const listaReactivos = [];
const formularioReactivos = document.getElementById('formulario');
const textoPregunta = document.getElementById('textoPregunta');
const textoRespuesta1 = document.getElementById('textoRespuesta');
const textoError = document.getElementById('textoError');
const botonAgregar = document.getElementById('btnAgregarRespuesta');
const botonLimpiar = document.getElementById('btnLimpiarFormulario');
const listaEnPantalla = document.getElementById('listaPreguntas');
const textoVacio = document.getElementById('textoVacio');

if(!formularioReactivos || !textoPregunta || !textoRespuesta || !textoError || 
    !botonAgregar || !botonLimpiar || !listaEnPantalla || !textoVacio)
{
    if(!formularioReactivos) console.error('No se encontró el formulario');
    if(!textoPregunta) console.error('No se encontró el campo de texto de la pregunta');
    if(!textoRespuesta) console.error('No se encontró el campo de texto de la respuesta');
    if(!textoError) console.error('No se encontró el campo de texto del error');
    if(!botonAgregar) console.error('No se encontró el botón de agregar respuesta');
    if(!botonLimpiar) console.error('No se encontró el botón de limpiar formulario');
    if(!listaPreguntas) console.error('No se encontró la lista de preguntas');
    if(!textoVacio) console.error('No se encontró el texto de lista vacía');

    throw new Error('No se encontraron los elementos del DOM necesarios');
}

function normalizarTexto(texto) {
    return texto.trim().toLowerCase().replace(/\s+/g, ' ');
}

function validar(){
    const pregunta = normalizarTexto(textoPregunta.value);
    const respuesta = normalizarTexto(textoRespuesta.value);

    let mensajeError = '';
    if(pregunta.length < 10){
        mensajeError = 'La pregunta debe tener al menos 10 caracteres.';
    }else if(respuesta.length < 1){
        mensajeError = 'La respuesta no puede estar vacía.';
    }else if(!respuesta){
        mensajeError = 'La respuesta es obligatoria';
    }

    textoError.textContent = mensajeError;
    botonAgregar.disabled = Boolean(mensajeError);

    return !mensajeError;
}

function pintarPantalla(){
    listaEnPantalla.textContent = '';
    textoVacio.textContent = '';
    textoVacio.style.display = listaReactivos.length ? "none": "block";
    for(let i = 0; i < listaReactivos.length; i++){
        const li = document.createElement('li');
        li.textContent = `#${i + 1} | P: ${listaReactivos[i].pregunta} | R:${listaReactivos[i].respuesta}`;
        listaEnPantalla.appendChild(li);
    }
}   

function limpiarFormulario(){
    console.log('Limpiando formulario');
    textoPregunta.value = '';
    textoRespuesta.value = '';
    textoError.textContent = '';
    btnAgregarRespuesta.disabled = true;
    textoPregunta.focus();
}

textoPregunta.addEventListener('input', validar);
textoRespuesta.addEventListener('input', validar);
botonLimpiar.addEventListener('click', limpiarFormulario);
formularioReactivos.addEventListener('submit',(e) => {
    e.preventDefault();//Evitar recarga de pagina
    if(!validar()) return;

    listaReactivos.push({
        pregunta: normalizarTexto(textoPregunta.value),
        respuesta: normalizarTexto(textoRespuesta.value),
    });
    limpiarFormulario();
    pintarPantalla();
});
validar();//Validacion inicial
pintarPantalla();//Pintar inicial

