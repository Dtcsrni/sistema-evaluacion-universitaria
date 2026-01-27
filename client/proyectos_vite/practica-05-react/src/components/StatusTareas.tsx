import type { EstadoTarea, Tarea } from '../types';;

//Componente que define el "contrato" como un estado que puede
//alterarse por medio de eventos

interface StatusTareasProps {
    tareas: Tarea[];
    status: EstadoTarea;
    color: string;

    //Drag and drop (tipado estricto)
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>, status: EstadoTarea) => void;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, id:number) => void;
    onDelete: (id:number) => void;
}

export function StatusTareas({
    tareas,
    status,
    color,
    onDragOver,
    onDrop,
    onDragStart,
    onDelete,   
}: StatusTareasProps) {  
    //Filtramos solo las tareas que pertenecen a esta columna
    const lista = tareas.filter(t => t.estado === status);

        const titulo = status === 'en-progreso' ? 'En Progreso' 
        : status.toUpperCase();
        return (
            <section 
                style={{
                    width: '30%',
                    minHeight: '320px',
                    border: `1px solid #ccc`,
                    borderRadius: '8px',
                    padding: '10px',
                }}
                onDragOver={onDragOver}
                onDrop={(e: React.DragEvent<HTMLDivElement>) => onDrop(e, status)}
            >
                <header
                    style={{
                        backgroundColor: color,
                        color: 'white',
                        padding: '10px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '10px',
                    }}
                >
                    <span> {titulo} </span>
                    {/* Contador de tareas en esa columna */}
                    <span
                        style={{
                            background: 'rgba(255, 255, 255, 0.25)',
                            padding: '4px 8px',
                            borderRadius: '12px',
                        }}
                    >
                        {lista.length}
                    </span>
                </header>
                {lista.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#777' }}>
                        No hay tareas; Arrastra una
                    </p>
                ) : (
                    lista.map(tarea => (
                        <div
                            key={tarea.id}
                            //Tareas activables por interaccion con raton
                            draggable
                            onDragStart={(e) => onDragStart(e, tarea.id)}
                            style={{
                                background: 'white',
                                color: 'black',
                                padding: '8px',
                                borderRadius: '4px',
                                marginBottom: '8px',
                                cursor: 'grab',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '10px',
                            }}
                            title="Arrastrar para mover"
                        >
                            <span>{tarea.nombre}</span>
                            <button
                                onClick={() => onDelete(tarea.id)}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: '4px',
                                    border: '1px solid #ddd',
                                    cursor: 'pointer',
                                }}
                            >
                                Eliminar
                            </button>
                        </div>
                    ))
                )}
            </section>
        );
    }