import axios from 'axios';
axios.post('http://127.0.0.1:3000/api/assistant', { query: 'Summarize this threat' })
  .then(res => console.log("SUCCESS:", res.data))
  .catch(err => {
    if (err.response) {
      console.log("ERROR STATUS:", err.response.status);
      console.log("ERROR DATA:", err.response.data);
    } else {
      console.log("ERROR:", err.message);
    }
  });
