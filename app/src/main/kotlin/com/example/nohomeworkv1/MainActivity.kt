package com.example.nohomeworkv1

import android.app.AlertDialog
import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import androidx.core.view.doOnPreDraw
import com.google.android.material.textfield.TextInputEditText
import java.io.OutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var handwritingView: HandwritingView
    private lateinit var textInput: TextInputEditText
    private lateinit var weatherSpinner: AutoCompleteTextView
    private lateinit var paperSpinner: AutoCompleteTextView
    private lateinit var randomnessSeekBar: SeekBar
    private lateinit var fontSizeSeekBar: SeekBar
    private lateinit var renderButton: Button
    private lateinit var exportButton: Button

    private val weatherOptions = arrayOf("Sunny", "Cloudy", "Rainy", "Windy", "Snowy")
    private val paperOptions = arrayOf("Lined", "Grid", "Ruled")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val toolbar = findViewById<Toolbar>(R.id.toolbar)
        setSupportActionBar(toolbar)

        handwritingView = findViewById(R.id.handwritingView)
        textInput = findViewById(R.id.textInput)
        weatherSpinner = findViewById(R.id.weatherSpinner)
        paperSpinner = findViewById(R.id.paperSpinner)
        randomnessSeekBar = findViewById(R.id.randomnessSeekBar)
        fontSizeSeekBar = findViewById(R.id.fontSizeSeekBar)
        renderButton = findViewById(R.id.renderButton)
        exportButton = findViewById(R.id.exportButton)

        // Setup spinners
        setupSpinner(weatherSpinner, weatherOptions, 1) // default Cloudy
        setupSpinner(paperSpinner, paperOptions, 0) // default Lined

        // Set initial values
        handwritingView.text = textInput.text.toString()
        handwritingView.weatherIndex = 1 // Cloudy
        handwritingView.paperStyle = 0
        handwritingView.randomness = 0.5f
        handwritingView.fontSize = 40f

        // Listeners
        renderButton.setOnClickListener {
            updateViewFromControls()
        }

        exportButton.setOnClickListener {
            exportBitmap()
        }

        // Line editing: when a line is clicked, show dialog to edit
        handwritingView.setOnLineClickedListener { lineIndex, lineText ->
            showEditLineDialog(lineIndex, lineText)
        }

        // Also update on text change (optional: auto-render)
        // We'll let user press Render button explicitly.
    }

    private fun setupSpinner(autoCompleteTextView: AutoCompleteTextView, items: Array<String>, defaultIndex: Int) {
        val adapter = ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, items)
        autoCompleteTextView.setAdapter(adapter)
        autoCompleteTextView.setText(items[defaultIndex], false)
        // Set listener to update view when item selected
        autoCompleteTextView.setOnItemClickListener { _, _, position, _ ->
            updateViewFromControls()
        }
    }

    private fun updateViewFromControls() {
        val text = textInput.text.toString()
        val weatherText = weatherSpinner.text.toString()
        val weatherIndex = weatherOptions.indexOf(weatherText).coerceAtLeast(0)
        val paperText = paperSpinner.text.toString()
        val paperIndex = paperOptions.indexOf(paperText).coerceAtLeast(0)
        val randomness = randomnessSeekBar.progress / 100f
        val fontSize = (fontSizeSeekBar.progress + 10).toFloat() // range 10-70

        handwritingView.text = text
        handwritingView.weatherIndex = weatherIndex
        handwritingView.paperStyle = paperIndex
        handwritingView.randomness = randomness
        handwritingView.fontSize = fontSize

        // Optionally, update view; invalidate is called inside setters
    }

    private fun showEditLineDialog(lineIndex: Int, currentText: String) {
        val builder = AlertDialog.Builder(this)
        builder.setTitle("Edit Line ${lineIndex + 1}")

        val input = EditText(this)
        input.setText(currentText)
        input.setSelection(currentText.length)
        builder.setView(input)

        builder.setPositiveButton("OK") { _, _ ->
            val newText = input.text.toString()
            // Update the lines list and redraw
            val lines = handwritingView.text.split("\n").toMutableList()
            if (lineIndex < lines.size) {
                lines[lineIndex] = newText
                handwritingView.text = lines.joinToString("\n")
                // Update text input as well
                textInput.setText(handwritingView.text)
            }
        }
        builder.setNegativeButton("Cancel", null)
        builder.show()
    }

    private fun exportBitmap() {
        // Wait for view to be laid out
        handwritingView.doOnPreDraw {
            val bitmap = handwritingView.getBitmap()
            saveBitmapToGallery(bitmap)
        }
    }

    private fun saveBitmapToGallery(bitmap: Bitmap) {
        val contentValues = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, "handwriting_${System.currentTimeMillis()}.png")
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/HandwritingStudio")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
        }

        val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
        uri?.let {
            try {
                contentResolver.openOutputStream(it)?.use { outputStream: OutputStream ->
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, outputStream)
                }
                Toast.makeText(this, "Exported to Gallery", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this, "Export failed: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    contentValues.clear()
                    contentValues.put(MediaStore.Images.Media.IS_PENDING, 0)
                    contentResolver.update(it, contentValues, null, null)
                }
            }
        } ?: run {
            Toast.makeText(this, "Failed to create media entry", Toast.LENGTH_SHORT).show()
        }
    }
}