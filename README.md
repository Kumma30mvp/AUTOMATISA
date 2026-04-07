# AUTOMATISA - Sitio Web

Sitio web corporativo para **AUTOMATISA**, taller de diagnóstico y servicio automotriz profesional ubicado en Los Olivos, Lima, Perú.

Desarrollado con **Next.js 16**, **React 19**, **Tailwind CSS 4** y **TypeScript**.

---

## Requisitos Previos

- **Node.js** v18.18 o superior ([descargar aquí](https://nodejs.org/))
- **npm** v9 o superior (incluido con Node.js)

Para verificar las versiones instaladas:

```bash
node -v
npm -v
```

---

## Instalación

Clonar el repositorio e instalar dependencias:

```bash
git clone <URL_DEL_REPOSITORIO>
cd automatisa
npm install
```

---

## Desarrollo

Iniciar el servidor de desarrollo local:

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000) en el navegador para ver el sitio.

Los cambios en el código se reflejan automáticamente en el navegador.

---

## Producción

### Generar el build de producción

```bash
npm run build
```

### Iniciar el servidor de producción

```bash
npm start
```

El sitio estará disponible en [http://localhost:3000](http://localhost:3000).

---

## Estructura del Proyecto

```text
automatisa/
├── public/
│   └── images/            # Imágenes del sitio (hero, about, mapa, etc.)
├── src/
│   ├── app/
│   │   ├── layout.tsx     # Layout principal (metadata SEO, fuentes)
│   │   ├── page.tsx       # Página principal (JSON-LD, secciones)
│   │   ├── globals.css    # Estilos globales y tema de colores
│   │   └── favicon.ico    # Ícono del sitio
│   ├── components/
│   │   ├── icons/         # Componentes SVG (Logo, WhatsApp)
│   │   ├── layout/        # Navbar y Footer
│   │   ├── sections/      # Secciones de la landing page
│   │   └── ui/            # Componentes reutilizables (botones)
│   └── lib/
│       ├── constants.ts   # Datos del negocio, servicios, enlaces
│       └── fonts.ts       # Configuración de fuentes (Manrope, Inter)
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
└── .gitignore
```

---

## Datos del Negocio

Toda la información del negocio (teléfono, dirección, horarios, enlaces de WhatsApp, servicios) se encuentra centralizada en:

```text
src/lib/constants.ts
```

Para actualizar cualquier dato del negocio, editar únicamente ese archivo.

---

## Despliegue

### Vercel (recomendado)

1. Crear una cuenta en [vercel.com](https://vercel.com)
2. Conectar el repositorio de GitHub
3. Vercel detectará automáticamente que es un proyecto Next.js
4. Hacer clic en **Deploy**

No se requiere configuración adicional.

### Otras plataformas

Para cualquier plataforma que soporte Node.js:

```bash
npm install
npm run build
npm start
```

La aplicación escucha en el puerto `3000` por defecto. Para cambiar el puerto:

```bash
PORT=8080 npm start
```

---

## Verificación de Calidad

Ejecutar el linter para verificar el código:

```bash
npm run lint
```

---

## Solución de Problemas

| Problema | Solución |
| -------- | -------- |
| `npm install` falla | Verificar que Node.js v18.18+ esté instalado. Eliminar `node_modules` y `package-lock.json`, luego ejecutar `npm install` nuevamente. |
| El sitio no carga en desarrollo | Verificar que el puerto 3000 no esté en uso. Revisar la terminal por errores. |
| Las imágenes no se muestran | Verificar que la carpeta `public/images/` contenga los archivos: `hero-bg.png`, `about.png`, `diagnostic.png`, `map-placeholder.png`. |
| Error de build en producción | Ejecutar `npm run lint` para identificar errores de código. |
| Las fuentes no cargan | Verificar la conexión a internet; las fuentes se descargan de Google Fonts durante el build. |

---

## Tecnologías

- **Next.js 16** - Framework de React
- **React 19** - Biblioteca de interfaz de usuario
- **Tailwind CSS 4** - Framework de estilos utilitarios
- **TypeScript 5** - Tipado estático
- **Lucide React** - Biblioteca de íconos
