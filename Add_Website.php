<?php

include("connection.php");

// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "Connection successful"; // Debugging output

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $website_title = $_POST['website_title'] ?? '';
    $website_link = $_POST['website_link'] ?? '';
    $website_keywords = $_POST['website_keywords'] ?? '';
    $website_description = $_POST['website_description'] ?? '';

    $file_name = $_FILES["Upload_Image"]["name"] ?? '';
    $temp_name = $_FILES["Upload_Image"]["tmp_name"] ?? '';

    $Folder = "Website_Images/" . $file_name;

    if (!empty($website_title) && !empty($website_link) && !empty($website_description) && !empty($website_keywords) && !empty($file_name)) {
        echo "All fields are filled"; // Debugging output
        if (move_uploaded_file($temp_name, $Folder)) {
            echo "File uploaded successfully"; // Debugging output
            $query = "INSERT INTO add_websites (website_titlle, website_link, website_keywords, website_images, website_description) VALUES ('$website_title', '$website_link', '$website_keywords', '$Folder', '$website_description')";
            if (!$data = mysqli_query($conn, $query)) {
                // Provide detailed error message
                echo "Database query failed: " . mysqli_error($connect);
            } else {
                echo "<script>alert('Website Inserted')</script>";
            }
        } else {
            echo "<script>alert('Failed to upload image.')</script>";
        }
    } else {
        echo "One or more fields are empty: \n";
        echo "Title: " . (!empty($website_title) ? 'filled' : 'empty') . "\n";
        echo "Link: " . (!empty($website_link) ? 'filled' : 'empty') . "\n";
        echo "Keywords: " . (!empty($website_keywords) ? 'filled' : 'empty') . "\n";
        echo "Description: " . (!empty($website_description) ? 'filled' : 'empty') . "\n";
        echo "File: " . (!empty($file_name) ? 'filled' : 'empty') . "\n";
        echo "<script>alert('All fields are required.')</script>";
    }
}
?>
