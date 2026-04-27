import jwt from 'jsonwebtoken';
const t = "some.jwt.token";
console.log(jwt.decode(t));
