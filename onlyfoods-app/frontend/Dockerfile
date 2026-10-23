FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Google Login (ว่าง = ไม่แสดงปุ่ม) : ค่าถูกฝังในไฟล์ JS ตอน build จึงต้องส่งมาเป็น build arg
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM nginx:alpine
# cache : index.html ถามทุกครั้ง ส่วน /assets/ (ชื่อมีรหัส build) เก็บได้ยาว (ดู nginx.conf)
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]