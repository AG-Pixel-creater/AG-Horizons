<?php
ini_set('memory_limit', '1024M'); // Increase memory limit to 1024M

$servername = "127.0.0.1";
$username = "root";
$password = "";
$dbname = "ag_horizons";

// Create connection
$conn = new mysqli($servername, $username, $password, $dbname);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
//echo "Connected successfully";
?>
