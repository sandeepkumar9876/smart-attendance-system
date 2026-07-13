import { useState } from "react";

function App() {
  const [student, setStudent] = useState({
    name: "",
    rollNo: "",
    department: "",
  });

  const handleChange = (e) => {
    setStudent({
      ...student,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = () => {
    alert("Student Registered Successfully!");
    console.log(student);
  };

  return (
    <div style={{ width: "400px", margin: "50px auto" }}>
      <h1>🎓 Student Registration</h1>

      <input
        type="text"
        name="name"
        placeholder="Enter Name"
        onChange={handleChange}
      />

      <br /><br />

      <input
        type="text"
        name="rollNo"
        placeholder="Enter Roll Number"
        onChange={handleChange}
      />

      <br /><br />

      <input
        type="text"
        name="department"
        placeholder="Enter Department"
        onChange={handleChange}
      />

      <br /><br />

      <button onClick={handleSubmit}>
        Register Student
      </button>
    </div>
  );
}

export default App;