import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState } from 'react';

/**
 * Carga datos de la BD cada vez que la pantalla gana el foco (al volver de editar, por ejemplo).
 * `key` identifica qué se carga (p. ej. el id de la pantalla): si cambia, se recarga.
 */
export function useData<T>(load: (db: SQLiteDatabase) => Promise<T>, key: string) {
  const db = useSQLiteContext();
  const [data, setData] = useState<T | null>(null);
  const [version, setVersion] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load(db).then((d) => {
        if (active) setData(d);
      });
      return () => {
        active = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, version, key]),
  );

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, reload, db };
}
