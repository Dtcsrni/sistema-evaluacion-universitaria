/*CRUD mínimo con delegación
Estado (Fuente de verdad)
 -listaReactivos: arreglo de objetos (pregunta, respuesta)
 -IndiceEnEdicion: null si estamos agregando elementos, o un número si estamos editando

 POE 
 -Input: validar y habilitar boton de envío
 -submit: agregar o actualizar según indiceEnEdicion
 -click en lista: delegación para editar o eliminar

 Seguridad:
 -textContent permitir imprimir texto del usuario sin riesgo de XSS
 -Evitar usar innerHTML
*/
const listaReactivos = [];
let indiceEnEdicion = null;

const formularioReactivo = document.getElementById('formulario-reactivo');
const textoPregunta = document.getElementById('textoPregunta');
const textoRespuesta = document.getElementById('textoRespuesta');
const textoError = document.getElementById('textoError');
const mensaje = document.getElementById('mensaje');
const btnGuardar = document.getElementById('btnGuardar');
const listaReactivosElemento = document.getElementById('listaReactivos');
const textoVacio = document.getElementById('textoVacio');



if(!formularioReactivo || !textoPregunta || !textoRespuesta || !textoError || 
    !btnGuardar || !listaReactivosElemento || !textoVacio)
{
    throw new Error('Faltan elementos del DOM. Revisa IDs en el html');
}
function normalizarTexto(texto) {
    return texto.trim().toLowerCase().replace(/\s+/g, ' ');
}
function validar(){
    const pregunta = normalizarTexto(textoPregunta.value);
    const respuesta = normalizarTexto(textoRespuesta.value);

    let errorMsg = '';
    if(pregunta.length < 10){
        errorMsg = 'La pregunta debe tener al menos 10 caracteres.';
    }
    else if(respuesta.length < 1){
        errorMsg = 'La respuesta no puede estar vacía.';
    }
    textoError.textContent = errorMsg;
    btnGuardar.disabled = Boolean(errorMsg);

    return !errorMsg;
}
function limpiarFormulario(){
    textoPregunta.value = '';
    textoRespuesta.value = '';
    textoError.textContent = '';
    btnGuardar.disabled = true;
    indiceEnEdicion = null;
    formularioReactivo.reset();
    textoPregunta.focus();
}
function pintarPantalla(){
    listaReactivosElemento.textContent = '';
    textoVacio.style.display = listaReactivos.length ? 'none' : 'block';
    

