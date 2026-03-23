Option Compare Database
Option Explicit

#If VBA7 Then
    Private Declare PtrSafe Sub Sleep Lib "kernel32" (ByVal dwMilliseconds As LongPtr)
#Else
    Private Declare Sub Sleep Lib "kernel32" (ByVal dwMilliseconds As Long)
#End If

' =====================================================
' People Counter ETL – UPRAVENÉ POD¼A REÁLNYCH TABULIEK
' =====================================================

Private Const SRC_FOLDER As String = "\\chwinapp04\Transfer_People_Counter\"
Private Const ROOT_FOLDER As String = "C:\Users\ch800\Documents\KPI_COCKPIT\"
Private Const INCOMING_FOLDER As String = ROOT_FOLDER & "incoming\"
Private Const WORK_FOLDER As String = ROOT_FOLDER & "work\"
Private Const ARCHIVE_FOLDER As String = ROOT_FOLDER & "archive\"

Private Const MIN_ZIP_SIZE_BYTES As Long = 5 * 1024

' =====================================================
' ENTRY POINT
' =====================================================
Public Sub Run_PeopleCounter_ETL()
    EnsureFolders
    MoveZipsFromShare          ' nechávame
    ProcessIncomingZips        ' spracuje LEN 1 ZIP (ako máš)
    MsgBox "ETL dokonèené", vbInformation
End Sub

' =====================================================
' FOLDERS
' =====================================================
Private Sub EnsureFolders()
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    If Not fso.FolderExists(INCOMING_FOLDER) Then fso.CreateFolder INCOMING_FOLDER
    If Not fso.FolderExists(WORK_FOLDER) Then fso.CreateFolder WORK_FOLDER
    If Not fso.FolderExists(ARCHIVE_FOLDER) Then fso.CreateFolder ARCHIVE_FOLDER
End Sub

' =====================================================
' MOVE ZIP FROM SHARE
' =====================================================
Private Sub MoveZipsFromShare()
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim f As Object

    If Not fso.FolderExists(SRC_FOLDER) Then Exit Sub

    For Each f In fso.GetFolder(SRC_FOLDER).Files
        If LCase(fso.GetExtensionName(f.Name)) = "zip" Then
            If f.Size > MIN_ZIP_SIZE_BYTES Then
                fso.MoveFile f.Path, INCOMING_FOLDER & f.Name
            End If
        End If
    Next f
End Sub

' =====================================================
' PROCESS INCOMING
' =====================================================
Private Sub ProcessIncomingZips()

    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim f As Object

    If Not fso.FolderExists(INCOMING_FOLDER) Then Exit Sub
    If fso.GetFolder(INCOMING_FOLDER).Files.Count = 0 Then Exit Sub

    For Each f In fso.GetFolder(INCOMING_FOLDER).Files
        If LCase(fso.GetExtensionName(f.Name)) = "zip" Then
            ProcessOneZip f.Path, f.Name
            Exit Sub ' spracuj len 1 ZIP
        End If
    Next f

End Sub

' =====================================================
' PROCESS SINGLE ZIP
' =====================================================
Private Sub ProcessOneZip(zipPath As String, zipName As String)

    On Error GoTo EH

    Dim shopCode As String
    Dim shopName As String
    Dim outFolder As String
    Dim excelPath As String
    Dim fso As Object

    Set fso = CreateObject("Scripting.FileSystemObject")

    ' 0) ZIP musí existova
    If Not fso.FileExists(zipPath) Then
        LogImport zipName, Null, "ERROR", "ZIP file not found: " & (zipPath & "")
        Exit Sub
    End If

    ' 1) WORK podprieèinok (NIKDY SA NEMAŽE)
    outFolder = WORK_FOLDER & fso.GetBaseName(zipName) & "\"
    If Not fso.FolderExists(outFolder) Then
        fso.CreateFolder outFolder
    End If

    ' 2) UNZIP ako prvý (do outFolder)
    If Not UnzipToFolder(zipPath, outFolder) Then
        LogImport zipName, Null, "ERROR", "UNZIP failed | folder=" & outFolder
        Exit Sub
    End If

    ' èakanie krátko, aby Shell uvo¾nil handle (nie mazanie, len stabilita)
    DoEvents
    Sleep 300

    ' kontrola – po UNZIP musí by nieèo v prieèinku
    If fso.GetFolder(outFolder).Files.Count = 0 _
       And fso.GetFolder(outFolder).SubFolders.Count = 0 Then

        LogImport zipName, Null, "ERROR", "WORK folder empty after UNZIP | folder=" & outFolder
        Exit Sub
    End If

    ' 3) RESOLVE SHOP pod¾a cfg_shops.shop_name (diakritika safe)
    shopCode = ResolveShopFromZip(zipName)          ' vráti shop_id (ZURICH/TIVOLI)
    If Len(shopCode & "") = 0 Then
        LogImport zipName, Null, "ERROR", "Shop nenájdený pod¾a cfg_shops.shop_name | ZIP=" & zipName
        Exit Sub
    End If

    shopName = GetShopName(shopCode)                ' vráti shop_name (Zürich/Tivoli)
    If Len(shopName & "") = 0 Then
        LogImport zipName, shopCode, "ERROR", "shop_name nenájdený v cfg_shops | shop_id=" & shopCode
        Exit Sub
    End If

    ' 4) NÁJDI EXCEL – tolerantné: Tivoli.xlsx / Zurich.xlsx / Zürich.xlsx
    excelPath = FindExcelByShop(outFolder, shopName, shopCode)

    If Len(excelPath & "") = 0 Then
        LogImport zipName, shopCode, "ERROR", _
            "Excel nenájdený | shop_name=" & shopName & " | shop_id=" & shopCode & " | folder=" & outFolder
        Exit Sub
    End If

    ' 5) PARSE EXCEL -> ACCESS
    ParseAndWrite excelPath, shopCode

    ' 6) presuò ZIP do ARCHIVE (overwrite-safe)
    On Error Resume Next
    If fso.FileExists(ARCHIVE_FOLDER & zipName) Then
        fso.DeleteFile ARCHIVE_FOLDER & zipName, True
    End If
    On Error GoTo EH
    Name zipPath As ARCHIVE_FOLDER & zipName

    ' 7) LOG OK
    LogImport zipName, shopCode, "OK", "Spracované | excel=" & excelPath
    Exit Sub

EH:
    LogImport zipName, shopCode, "ERROR", Err.Description

End Sub

' =====================================================
' SHOP RESOLVE – pod¾a cfg_shops.shop_name (diakritika safe)
' vracia shop_id (ZURICH / TIVOLI)
' =====================================================
Public Function ResolveShopFromZip(zipName As String) As String

    Dim rs As DAO.Recordset
    Dim sql As String
    Dim zipNorm As String
    Dim shopNorm As String

    ResolveShopFromZip = ""

    zipNorm = RemoveDiacritics(LCase(zipName & ""))

    sql = "SELECT shop_id, shop_name FROM cfg_shops WHERE active=True"
    Set rs = CurrentDb.OpenRecordset(sql, dbOpenSnapshot)

    Do While Not rs.EOF
        shopNorm = RemoveDiacritics(LCase(rs!shop_name & ""))

        If Len(shopNorm) > 0 Then
            If InStr(1, zipNorm, shopNorm, vbTextCompare) > 0 Then
                ResolveShopFromZip = rs!shop_id & ""
                rs.Close
                Exit Function
            End If
        End If

        rs.MoveNext
    Loop

    rs.Close
End Function

' =====================================================
' DIACRITICS (robust SK/DE)
' =====================================================
Private Function RemoveDiacritics(ByVal s As String) As String
    s = LCase(s & "")

    s = Replace(s, "á", "a")
    s = Replace(s, "ä", "a")
    s = Replace(s, "è", "c")
    s = Replace(s, "ï", "d")
    s = Replace(s, "é", "e")
    s = Replace(s, "ì", "e")
    s = Replace(s, "í", "i")
    s = Replace(s, "¾", "l")
    s = Replace(s, "å", "l")
    s = Replace(s, "ò", "n")
    s = Replace(s, "ó", "o")
    s = Replace(s, "ô", "o")
    s = Replace(s, "ö", "o")
    s = Replace(s, "ø", "r")
    s = Replace(s, "š", "s")
    s = Replace(s, "", "t")
    s = Replace(s, "ú", "u")
    s = Replace(s, "ü", "u")
    s = Replace(s, "ý", "y")
    s = Replace(s, "ž", "z")

    RemoveDiacritics = s
End Function

' =====================================================
' Get shop_name pod¾a shop_id
' =====================================================
Public Function GetShopName(shopCode As String) As String

    Dim rs As DAO.Recordset
    Dim sql As String

    GetShopName = ""

    sql = "SELECT shop_name FROM cfg_shops WHERE shop_id = '" & Replace(shopCode & "", "'", "''") & "'"
    Set rs = CurrentDb.OpenRecordset(sql, dbOpenSnapshot)

    If Not rs.EOF Then
        GetShopName = rs!shop_name & ""
    End If

    rs.Close
    Set rs = Nothing
End Function

' =====================================================
' PARSE + WRITE (tvoj pôvodný základ)
' =====================================================
Private Sub ParseAndWrite(excelPath As String, shopCode As String)

    Dim xl As Object, wb As Object
    Dim ws1 As Object, ws2 As Object
    Dim kpiDate As Date
    Dim kpiDateSql As String

    ' ===============================
    ' OPEN EXCEL
    ' ===============================
    Set xl = CreateObject("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False

    Set wb = xl.Workbooks.Open(excelPath, False, True)
    Set ws1 = wb.Sheets(1)
    Set ws2 = wb.Sheets(2)

  
  ' ===============================
' KPI DATE – z Sheet1!A6 (Berichtszeit)
' ===============================
Dim berichtText As String
Dim dateText As String

berichtText = Trim(ws1.Range("A6").Value & "")

' oèakávané: "Berichtszeit: YYYY/MM/DD 00:00:00 - YYYY/MM/DD 23:59:59"
If InStr(berichtText, "Berichtszeit:") > 0 Then

    ' vezme 10 znakov hneï za "Berichtszeit: "
    dateText = Mid(berichtText, Len("Berichtszeit: ") + 1, 10)

    If IsDate(Replace(dateText, "/", "-")) Then
        kpiDate = DateValue(Replace(dateText, "/", "-"))
    Else
        kpiDate = Date
    End If

Else
    kpiDate = Date
End If

kpiDateSql = "#" & Format(kpiDate, "yyyy-mm-dd") & "#"


    ' ===============================
    ' DELETE OLD DATA
    ' ===============================
    ' CurrentDb.Execute _
        "DELETE FROM kpi_daily_overview WHERE shop_id='" & shopCode & "' AND kpi_date=" & kpiDateSql

     'CurrentDb.Execute _
        "DELETE FROM kpi_age_distribution WHERE shop_id='" & shopCode & "' AND kpi_date=" & kpiDateSql

     'CurrentDb.Execute _
        "DELETE FROM kpi_hourly_visitors WHERE shop_id='" & shopCode & "' AND kpi_date=" & kpiDateSql

    ' ===============================
    ' DAILY KPI
    ' ===============================
    Dim male As Long, female As Long, unknown As Long, total As Long

    male = SafeLong(ws2.Range("A11").Value)
    female = SafeLong(ws2.Range("C11").Value)
    unknown = SafeLong(ws2.Range("E11").Value)
    total = male + female + unknown

    CurrentDb.Execute _
        "INSERT INTO kpi_daily_overview " & _
        "(shop_id, kpi_date, visitors_total, visitors_male, visitors_female, visitors_unknown) VALUES (" & _
        "'" & shopCode & "'," & kpiDateSql & "," & _
        total & "," & male & "," & female & "," & unknown & ")"
        
        ' ===============================
' LOAD SALES FROM MSSQL
' ===============================
Dim salesNet As Currency

salesNet = GetSalesNetFromMsSql(shopCode, kpiDate)

CurrentDb.Execute _
    "UPDATE kpi_daily_overview SET " & _
    "sales_net = " & Replace(CStr(salesNet), ",", ".") & " " & _
    "WHERE shop_id = '" & shopCode & "' " & _
    "AND kpi_date = " & kpiDateSql, _
    dbFailOnError

Debug.Print "SALES loaded | Shop=" & shopCode & _
            " | Date=" & kpiDateSql & _
            " | Sales=" & salesNet


    ' ===============================
    ' AGE DISTRIBUTION
    ' (Sheet 2, rows 13–25)
    ' ===============================
    Dim r As Long
    Dim ageLabel As String
    Dim ageCount As Long

    For r = 13 To 25

        ageLabel = Trim(ws2.Range("C" & r).Value & "")
        ageCount = SafeLong(ws2.Range("D" & r).Value)

        If ageLabel <> "" Then
            Select Case LCase(ageLabel)
                Case "männlich", "weiblich", "nicht erkannt"
                    ' tieto patria do DAILY KPI – preskoèi
                Case Else
                    CurrentDb.Execute _
                        "INSERT INTO kpi_age_distribution " & _
                        "(shop_id, kpi_date, age_bucket, visitors_count) VALUES (" & _
                        "'" & shopCode & "'," & kpiDateSql & "," & _
                        "'" & Replace(ageLabel, "'", "''") & "'," & ageCount & ")"
            End Select
        End If

    Next r

    ' ===============================
    ' HOURLY VISITORS
    ' (Sheet 2, rows 33–48)
    ' ===============================
    Dim hourLabel As String
    Dim hMale As Long, hFemale As Long, hUnknown As Long, hTotal As Long

    For r = 33 To 48

        hourLabel = Trim(ws2.Range("B" & r).Value & "")

        If hourLabel <> "" Then

            hMale = SafeLong(ws2.Range("C" & r).Value)
            hFemale = SafeLong(ws2.Range("E" & r).Value)
            hUnknown = SafeLong(ws2.Range("G" & r).Value)
            hTotal = hMale + hFemale + hUnknown

            CurrentDb.Execute _
                "INSERT INTO kpi_hourly_visitors " & _
                "(shop_id, kpi_date, visit_hour, visitors_male, visitors_female, visitors_unknown, visitors_total) VALUES (" & _
                "'" & shopCode & "'," & kpiDateSql & "," & _
                "'" & Replace(hourLabel, "'", "''") & "'," & _
                hMale & "," & hFemale & "," & hUnknown & "," & hTotal & ")"

        End If

    Next r
    
    

    ' ===============================
    ' CLOSE EXCEL
    ' ===============================
    wb.Close False
    xl.Quit

    Set ws2 = Nothing
    Set ws1 = Nothing
    Set wb = Nothing
    Set xl = Nothing

End Sub


' =====================================================
' FIND EXCEL – tolerantné na diakritiku a shop_id fallback
'   - primárne: match na shop_name (Zürich / Tivoli)
'   - fallback: match na shop_id (ZURICH / TIVOLI)
' =====================================================
Public Function FindExcelByShop(folderPath As String, shopName As String, shopId As String) As String

    Dim fso As Object
    Dim f As Object
    Dim subFld As Object

    Dim fileNorm As String
    Dim wantName As String
    Dim wantId As String

    Set fso = CreateObject("Scripting.FileSystemObject")

    wantName = RemoveDiacritics(LCase(shopName & ""))
    wantId = RemoveDiacritics(LCase(shopId & ""))

    ' =====================================================
    ' 1?? PRIORITA: AK EXISTUJE JEDINÝ EXCEL › VEZMI HO
    ' =====================================================
    Dim excelCount As Long
    excelCount = 0

    For Each f In fso.GetFolder(folderPath).Files
        If LCase(fso.GetExtensionName(f.Name)) Like "xls*" Then
            excelCount = excelCount + 1
            FindExcelByShop = f.Path
        End If
    Next f

    If excelCount = 1 Then
        Exit Function
    End If

    ' =====================================================
    ' 2?? AK JE VIAC EXCELOV › SKÚS MATCH POD¼A SHOPU
    ' =====================================================
    For Each f In fso.GetFolder(folderPath).Files
        If LCase(fso.GetExtensionName(f.Name)) Like "xls*" Then

            fileNorm = RemoveDiacritics(LCase(f.Name & ""))

            ' match na shop_name alebo shop_id
            If (Len(wantName) > 0 And InStr(1, fileNorm, wantName, vbTextCompare) > 0) _
               Or (Len(wantId) > 0 And InStr(1, fileNorm, wantId, vbTextCompare) > 0) Then

                FindExcelByShop = f.Path
                Exit Function
            End If
        End If
    Next f

    ' =====================================================
    ' 3?? REKURZÍVNE PODPRIEÈINKY
    ' =====================================================
    For Each subFld In fso.GetFolder(folderPath).SubFolders
        FindExcelByShop = FindExcelByShop(subFld.Path, shopName, shopId)
        If Len(FindExcelByShop & "") > 0 Then Exit Function
    Next subFld

    ' =====================================================
    ' 4?? NIÈ SA NENAŠLO
    ' =====================================================
    FindExcelByShop = ""

End Function


' =====================================================
' LOG IMPORT – pod¾a tvojich ståpcov (TEXT)
' =====================================================
Private Sub LogImport( _
    zipName As String, _
    shopId As Variant, _
    status As String, _
    msg As String, _
    Optional kpiDate As Variant _
)

    Dim sql As String
    Dim runTs As String
    Dim kpiDateTxt As String
    Dim shopTxt As String

    runTs = Format(Now(), "yyyy-mm-dd HH:nn:ss")

    If IsDate(kpiDate) Then
        kpiDateTxt = Format(CDate(kpiDate), "yyyy-mm-dd")
    Else
        kpiDateTxt = ""
    End If

    If IsNull(shopId) Then
        shopTxt = ""
    Else
        shopTxt = shopId & ""
    End If

    sql = "INSERT INTO etl_import_log " & _
          "(run_timestamp, shop_id, kpi_date, [status], [message]) VALUES (" & _
          "'" & Replace(runTs, "'", "''") & "'," & _
          "'" & Replace(shopTxt, "'", "''") & "'," & _
          "'" & Replace(kpiDateTxt, "'", "''") & "'," & _
          "'" & Replace(status & "", "'", "''") & "'," & _
          "'" & Replace((msg & "") & " | ZIP=" & (zipName & ""), "'", "''") & "')"

    CurrentDb.Execute sql, dbFailOnError
End Sub

' =====================================================
' UNZIP (Shell CopyHere + wait)
' =====================================================
Public Function UnzipToFolder(zipPath As String, targetFolder As String) As Boolean
    On Error GoTo EH

    Dim cmd As String
    Dim wsh As Object
    Dim fso As Object

    Set fso = CreateObject("Scripting.FileSystemObject")

    ' kontrola ZIP
    If Not fso.FileExists(zipPath) Then Exit Function

    ' cie¾ový prieèinok
    If Not fso.FolderExists(targetFolder) Then
        fso.CreateFolder targetFolder
    End If

    ' PowerShell – BLOKUJÚCE rozbalenie
    cmd = "powershell -NoProfile -ExecutionPolicy Bypass -Command " & _
          """Expand-Archive -LiteralPath '" & zipPath & _
          "' -DestinationPath '" & targetFolder & "' -Force"""

    Set wsh = CreateObject("WScript.Shell")
    wsh.Run cmd, 0, True   ' ‹ True = ÈAKÁ, kým unzip skonèí
    Set wsh = Nothing

    ' finálna kontrola
    If fso.GetFolder(targetFolder).Files.Count > 0 _
       Or fso.GetFolder(targetFolder).SubFolders.Count > 0 Then
        UnzipToFolder = True
    Else
        UnzipToFolder = False
    End If

    Exit Function

EH:
    UnzipToFolder = False
End Function

Private Function SafeLong(ByVal v As Variant) As Long
    On Error GoTo SafeExit

    If IsError(v) Then GoTo SafeExit
    If IsNull(v) Then GoTo SafeExit
    If Trim(v & "") = "" Then GoTo SafeExit
    If Not IsNumeric(v) Then GoTo SafeExit

    SafeLong = CLng(v)
    Exit Function

SafeExit:
    SafeLong = 0
End Function

Private Function GetMsSqlConnection() As Object

    Dim cn As Object
    Set cn = CreateObject("ADODB.Connection")

    cn.ConnectionString = _
        "Provider=SQLOLEDB;" & _
        "Data Source=CHWINSQL03;" & _
        "Initial Catalog=MXR;" & _
        "User ID=mxodbc;" & _
        "Password=mxodbc;" & _
        "Trusted_Connection=No;"

    cn.Open
    Set GetMsSqlConnection = cn

End Function

Private Function GetSalesNetFromMsSql( _
    ByVal shopId As String, _
    ByVal kpiDate As Date _
) As Currency

    Dim cashDeskNr As String

    Select Case shopId
        Case "TIVOLI":  cashDeskNr = "709"
        Case "ZURICH":  cashDeskNr = "710"
        Case Else
            GetSalesNetFromMsSql = 0
            Exit Function
    End Select

    Dim cn As Object
    Dim rs As Object
    Dim sql As String
    Dim sqlDate As String

    sqlDate = Format(kpiDate, "yyyy-MM-dd")

    Set cn = GetMsSqlConnection()
    Set rs = CreateObject("ADODB.Recordset")

    sql = _
        "SELECT " & _
        "ISNULL((SELECT SUM(DocTotal) FROM dbo.OINV " & _
        "WHERE U_VK_CashDeskNr = '" & cashDeskNr & "' " & _
        "AND CAST(docdate AS date) = '" & sqlDate & "'), 0) " & _
        "- " & _
        "ISNULL((SELECT SUM(DocTotal) FROM dbo.ORIN " & _
        "WHERE U_VK_CashDeskNr = '" & cashDeskNr & "' " & _
        "AND CAST(docdate AS date) = '" & sqlDate & "'), 0) " & _
        "AS sales_net"

    rs.Open sql, cn, 0, 1   ' forward-only, read-only

    If Not rs.EOF Then
        GetSalesNetFromMsSql = Nz(rs.Fields("sales_net").Value, 0)
    Else
        GetSalesNetFromMsSql = 0
    End If

    rs.Close
    cn.Close

    Set rs = Nothing
    Set cn = Nothing

End Function


