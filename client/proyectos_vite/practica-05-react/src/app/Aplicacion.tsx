import { useEffect, useMemo, useState } from "react";
import type { EstadoTarea, Tarea } from "../types.ts";
import {StatusTareas} from '../components/StatusTareas.tsx';
import '../App.css';

//Componente principal de la aplicacion
//Define claves propias para Drag and drop
//Evita usar 'text/plain' generico 

const DND_KEY = 'application/x-tarea-id';
//Persistencia local 
const STORAGE_KEY = 'tareas-app-react-v1';

export default function Aplicacion() {
    //Estado global de la lista de tareas
    //Solo leer de localStorage una sola vez al inicio
    const [tareas, setTareas] = useState<Tarea[]>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) as Tarea[] : [];
        } catch {
            return [];
        }   
    });
    //Guardar en localStorage cada vez que cambie la lista de tareas
    //Estado del input 
    const [nuevaTarea, setNuevaTarea] = useState<string>('');
    //Persistencia cada que cambie la tarea

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tareas));
    }, [tareas]);

    //Calcular contadores cuando cambian tareas

    const resumen = useMemo(() => {
        const pendiente = tareas.filter(t => t.estado === 'pendiente').length;
        const enProgreso = tareas.filter(t => t.estado === 'en-progreso').length;
        const completada = tareas.filter(t => t.estado === 'completada').length;
        return { pendiente, enProgreso, completada };
    }, [tareas]);

    //Registrar una nueva tarea 
    //Validacion basica

    const registrarTarea = () => {
        const nombre = nuevaTarea.trim();
        if(!nombre){
            alert('El nombre de la tarea no puede estar vacio');
            return;
        }
        const tarea: Tarea = {
            id: Date.now(),
            nombre, 
            estado: 'pendiente',
        };
        setTareas(prev => [...prev, tarea]);
        setNuevaTarea("");
    };
    //Funcion que detecta si se presiona enter, y registra la tarea
    const manejarKeyDown: 
    React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if(e.key === 'Enter')
            registrarTarea();
    };
    //Funcion que comienza el arraste y guarda el id en dataTransfer
    const onDragStart = (e: React.DragEvent<HTMLDivElement>, id:number) => {
        e.dataTransfer.setData(DND_KEY, String(id));
        e.dataTransfer.effectAllowed = 'move';
    };
    //Funcion que permite soltar en el area destino
    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    //Funcion que se ejecuta al soltar un objeto en el area destino
    const onDrop = (e: React.DragEvent<HTMLDivElement>, newStatus: EstadoTarea) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData(DND_KEY);
        const id = Number(raw);
        //Validacion de numero en ID
        if(!raw || Number.isNaN(id)) return;

        setTareas(prev => prev.filter(t => t.id !== id));
    };
    //Funcion  que elimina una tarea por ID
    const onDelete = (id:number) => {
        setTareas(prev => prev.filter(t => t.id !== id));
    }; 

    //Funcion para limpiar todas las tareas
    const reset = () => {
        setTareas([]);  
        setNuevaTarea('');
    };
    return (
        <div>
            <div
                style={{
                    display: 'flex',
                    gap: '10px',
                    marginBottom: '14px',
                }}
            >
                <input
                    type="text"
                    value={nuevaTarea}
                    placeholder="Nueva tarea..."
                    onChange={(e) => setNuevaTarea(e.target.value)}
                    onKeyDown={manejarKeyDown}
                    style={{
                        padding: '8px',
                        width: '200px',
                    }}
                />
                <button
                    onClick={reset}
                    style={{
                        padding: '10px 16px',
                        marginBottom: 10,
                    }}
                >
                    Reiniciar panel
                </button>
            </div>
            {/* Columnas */}
            <div
                style={{
                    display: 'flex',
                    gap: '12px',
                    justifyContent: 'space-between',
                }}
            >
                <StatusTareas
                    tareas={tareas}
                    status="pendiente"
                    color="#d9f312"
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onDelete={onDelete}
                />
                <StatusTareas
                    tareas={tareas}
                    status="en-progreso"
                    color="#12caf3"
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onDelete={onDelete}
                />
                <StatusTareas
                    tareas={tareas}
                    status="completada"
                    color="#12f37e"
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onDelete={onDelete}
                />
            </div>
        </div>
    );
}


          

        