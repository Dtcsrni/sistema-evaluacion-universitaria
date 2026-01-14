/*Script para formularios POE*/
/*-Estado: listaReactivos*/
/*-Validacion: cantidad mínima de preguntas y formularios no vacios*/
/*Handlers o escuchadores de eventos*/
const listaReactivos = [];
const formularioReactivos = document.getElementById('formulario');
const textoPregunta = document.querySelector('textoPregunta');
const textoRespuesta1 = document.querySelector('textoRespuesta');
const textoError = document.getElementById('error');
const botonAgregar = document.getElementById('btnAgregarRespuesta');
const botonLimpiar = document.getElementById('btnGuardarFormulario');
const listaPreguntas = document.querySelector('listaPreguntas');
const textoVacio = document.querySelector('textoVacio');


