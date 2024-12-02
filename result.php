<!DOCTYPE html>
<html>
    <head>
        <title>Result | AG</title>
        <link rel="stylesheet" href="result.css">
    </head>
    <body>
        <form action="" method="GET">
            <table border="0" width="100%" align="center" bgcolor="#2E4053">
                <tr>
                    <td width="10%"> 
                        <a href="index.html"><img src="WebSite_Images/Logo Of AG.jpg" width="55%" alt="Logo Of AG"></a>
                    </td>
                    <td>
                        <input type="text" name="Search_Bar" id="Searchfield">
                        <input type="submit" name="Search_Button" value="Search" id="SearchButton">
                    </td>   
                </tr>
            </table>
        </form>
        <table border="0" style="margin-left:105px">
            <tr>
                <?php
                    include("connection.php");

                    if (isset($_GET['Search_Button'])) {
                        $search = $_GET['Search_Bar'];

                        if ($search == "") {
                            echo "Please write something in the box";
                            exit();
                        }

                        $query = "SELECT * FROM add_websites WHERE Website_Keywords LIKE '%$search%' limit 0,4";
                        $data = mysqli_query($conn, $query);

                        // Check if query was successful
                        if (!$data) {
                            echo "<tr><td>Query failed: " . mysqli_error($conn) . "</td></tr>";
                            exit();
                        }

                        if (mysqli_num_rows($data) < 1) {
                            echo "<tr><td>No result found</td></tr>";
                            exit();
                        }

                        echo "<a href='#' style='margin-left:105px;'>More Images for $search</a>";
                        while ($row = mysqli_fetch_array($data)) {
                            // Ensure the array key exists before accessing it
                            $imageSrc = $row[4] ?? 'No image';
                            echo "
                                <td>
                                    <img src='$imageSrc' width='200px;'>
                                </td>
                            ";
                        }
                    }
                    ?>
            </tr>
        </table>
        <br>
        <table border="0" width="70%"style="margin-left: 105px">
               <?php
                    $query1 = "SELECT * FROM add_websites WHERE Website_Keywords LIKE '%$search%'";
                    $data1 = mysqli_query($conn, $query1);
                    while ($row1 = mysqli_fetch_array($data1)) {
                        echo "
                            <tr> 
                                <td>
                                    <font size='4' color='#0000cc'><b><a href='$row1[1]'>$row1[0]</b></a></font><br>
                                        <font size='3'color='#006400'>$row1[1]</font><br>
                                        <font size='3'color='#666666'>$row1[3]</font><br><br>
                                    </td>
                                </tr>
                            ";
                        }
                ?>
        </table> 
    </body>
</html>
