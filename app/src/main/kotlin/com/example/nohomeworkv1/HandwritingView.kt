package com.example.nohomeworkv1

import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import com.example.nohomeworkv1.NativeLib.unpackGlyphData
import com.example.nohomeworkv1.NativeLib.unpackInkData
import kotlin.math.abs

class HandwritingView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    // State
    var text: String = "The quick brown fox jumps over the lazy dog.\nThis is a second line."
        set(value) {
            field = value
            lines = value.split("\n")
            requestLayout()
            invalidate()
        }

    var weatherIndex: Int = 1 // 0=Sunny,1=Cloudy,2=Rainy,3=Windy,4=Snowy
        set(value) {
            field = value
            invalidate()
        }

    var randomness: Float = 0.5f
        set(value) {
            field = value.coerceIn(0f, 1f)
            invalidate()
        }

    var paperStyle: Int = 0 // 0=Lined, 1=Grid, 2=Ruled
        set(value) {
            field = value
            invalidate()
        }

    var fontSize: Float = 40f
        set(value) {
            field = value
            invalidate()
        }

    private var lines: List<String> = text.split("\n")
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.BLACK
        style = Paint.Style.FILL
        textSize = fontSize
        typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
    }

    private val marginX = 40f
    private var marginY = 60f
    private var lineHeight = fontSize * 1.5f

    // For line editing
    private var onLineClickedListener: ((lineIndex: Int, lineText: String) -> Unit)? = null

    fun setOnLineClickedListener(listener: (Int, String) -> Unit) {
        onLineClickedListener = listener
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        // Adjust margins and line height based on view size
        marginY = 60f
        lineHeight = fontSize * 1.6f
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        // 1. Generate seed and ink data
        val seed = try {
            NativeLib.generatePaperSeed(42)
        } catch (e: UnsatisfiedLinkError) {
            // Fallback seed if library not loaded
            42
        }

        val inkPacked = try {
            NativeLib.processInk(seed, weatherIndex, randomness, fontSize.toInt())
        } catch (e: UnsatisfiedLinkError) {
            // Fallback packed value: bleed=128, spread=128, waviness=128, opacity=255
            (128 shl 24) or (128 shl 16) or (128 shl 8) or 255
        }
        val ink = unpackInkData(inkPacked)

        // 2. Draw background paper (simplified: just fill with light color)
        canvas.drawColor(Color.parseColor("#FFF8E7")) // parchment

        // Draw lines or grid based on paperStyle (simplified)
        drawPaperBackground(canvas)

        // 3. Draw text lines
        paint.textSize = fontSize
        val charWidth = paint.measureText("A") // approximate

        lines.forEachIndexed { lineIndex, lineText ->
            var xPos = marginX
            val yBase = marginY + lineIndex * lineHeight

            for (char in lineText) {
                val variationPacked = try {
                    NativeLib.getGlyphVariation(seed, char.code, randomness)
                } catch (e: UnsatisfiedLinkError) {
                    // Fallback: no variation
                    (128 shl 24) or (128 shl 16) or (128 shl 8) or 128 // scale=1.0, rot=0, offset=0
                }
                val glyph = unpackGlyphData(variationPacked)

                val jitter = try {
                    NativeLib.getBaselineJitter(seed, xPos, 0.15f, 2.5f)
                } catch (e: UnsatisfiedLinkError) {
                    0f
                }

                canvas.save()
                canvas.translate(xPos, yBase + jitter + glyph.baselineOffset)
                canvas.scale(glyph.scaleX, glyph.scaleY)
                canvas.rotate(Math.toDegrees(glyph.rotation.toDouble()).toFloat())

                // Apply ink effects: opacity
                paint.alpha = (ink.opacity / 255f * 255).toInt().coerceIn(0, 255)

                // Draw character
                canvas.drawText(char.toString(), 0f, 0f, paint)

                canvas.restore()

                // Advance x position (using measured width of character * scaleX)
                val charWidthScaled = paint.measureText(char.toString()) * glyph.scaleX
                xPos += charWidthScaled
            }
        }
    }

    private fun drawPaperBackground(canvas: Canvas) {
        val paint = Paint().apply {
            color = Color.parseColor("#E0E0E0")
            strokeWidth = 2f
        }
        when (paperStyle) {
            0 -> { // Lined
                var y = marginY
                while (y < height) {
                    canvas.drawLine(marginX, y, width - marginX, y, paint)
                    y += lineHeight
                }
            }
            1 -> { // Grid
                var x = marginX
                while (x < width) {
                    canvas.drawLine(x, marginY, x, height - marginY, paint)
                    x += 60f
                }
                var y = marginY
                while (y < height) {
                    canvas.drawLine(marginX, y, width - marginX, y, paint)
                    y += 60f
                }
            }
            2 -> { // Ruled (similar to lined but with thicker lines for margins)
                // Same as lined for simplicity
                var y = marginY
                while (y < height) {
                    canvas.drawLine(marginX, y, width - marginX, y, paint)
                    y += lineHeight
                }
            }
        }
    }

    // Touch handling for line editing
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_UP) {
            val x = event.x
            val y = event.y
            // Determine which line was tapped (based on y position)
            val lineIndex = ((y - marginY) / lineHeight).toInt()
            if (lineIndex in lines.indices) {
                val lineText = lines[lineIndex]
                onLineClickedListener?.invoke(lineIndex, lineText)
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    // Utility to get bitmap for export
    fun getBitmap(): Bitmap {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        draw(canvas)
        return bitmap
    }
}