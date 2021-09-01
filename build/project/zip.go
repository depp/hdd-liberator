package project

import (
	"bytes"
	"compress/flate"
	"context"
	"encoding/binary"
	"hash/crc32"
	"time"
)

type dosDate struct {
	date uint16
	time uint16
}

func toDOSDate(t time.Time) dosDate {
	y, m, d := t.Date()
	hh, mm, ss := t.Clock()
	return dosDate{
		date: uint16(((y - 1980) << 9) | (int(m) << 5) | d),
		time: uint16((hh << 11) | (mm << 5) | (ss >> 1)),
	}
}

type slicewriter []byte

func (s *slicewriter) write(d []byte) {
	copy(*s, d)
	*s = (*s)[len(d):]
}

func (s *slicewriter) skip(n int) {
	*s = (*s)[n:]
}

func (s *slicewriter) u16(x uint16) {
	binary.LittleEndian.PutUint16(*s, x)
	*s = (*s)[2:]
}

func (s *slicewriter) u32(x uint32) {
	binary.LittleEndian.PutUint32(*s, x)
	*s = (*s)[4:]
}

type zipwriter struct {
	body      []byte
	directory []byte
	filecount int
}

func (w *zipwriter) addfile(name string, modtime time.Time, data []byte) error {
	// Compress file.
	var buf bytes.Buffer
	zw, err := flate.NewWriter(&buf, flate.BestCompression)
	if err != nil {
		return err
	}
	if _, err := zw.Write(data); err != nil {
		return err
	}
	if err := zw.Close(); err != nil {
		return err
	}
	cdata := buf.Bytes()

	crc := crc32.ChecksumIEEE(data)
	md := toDOSDate(modtime)

	// Directory entry.
	{
		var buf [46]byte
		b := slicewriter(buf[:])
		b.u32(0x02014b50)          // signature
		b.u16(20)                  // version made by
		b.u16(20)                  // version needed
		b.u16(0)                   // flags
		b.u16(8)                   // compression method
		b.u16(md.time)             // mod time
		b.u16(md.date)             // mod date
		b.u32(crc)                 // crc-32
		b.u32(uint32(len(cdata)))  // compressed size
		b.u32(uint32(len(data)))   // uncompressed size
		b.u16(uint16(len(name)))   // file name length
		b.skip(12)                 // misc
		b.u32(uint32(len(w.body))) // relative offset
		if len(b) != 0 {
			panic("mismatch")
		}
		w.directory = append(w.directory, buf[:]...)
		w.directory = append(w.directory, name...)
	}

	// Main body.
	{
		var buf [30]byte
		b := slicewriter(buf[:])
		b.u32(0x04034b50)         // signature
		b.u16(20)                 // version needed
		b.u16(0)                  // flags
		b.u16(8)                  // compression method
		b.u16(md.time)            // mod time
		b.u16(md.date)            // mod date
		b.u32(crc)                // crc-32
		b.u32(uint32(len(cdata))) // compressed size
		b.u32(uint32(len(data)))  // uncompressed size
		b.u16(uint16(len(name)))  // file name length
		b.u16(0)                  // extra field length
		if len(b) != 0 {
			panic("mismatch")
		}
		w.body = append(w.body, buf[:]...)
		w.body = append(w.body, name...)
		w.body = append(w.body, cdata...)
	}

	w.filecount++
	return nil
}

func (w *zipwriter) todata() []byte {
	data := make([]byte, len(w.body)+len(w.directory)+22)
	b := slicewriter(data)
	b.write(w.body)
	b.write(w.directory)
	b.u32(0x06054b50)               // signature
	b.u16(0)                        // multi-disk
	b.u16(0)                        // multi-disk
	b.u16(uint16(w.filecount))      // directory entry count
	b.u16(uint16(w.filecount))      // directory entry count
	b.u32(uint32(len(w.directory))) // directory size
	b.u32(uint32(len(w.body)))      // directory offset
	b.u16(0)                        // comment length
	if len(b) != 0 {
		panic("mismatch")
	}
	return data
}

// BuildZip creates a zip file containing the final product.
func (d *CompoData) BuildZip(ctx context.Context) ([]byte, error) {
	h, err := d.BuildHTML(nil)
	if err != nil {
		return nil, err
	}
	var w zipwriter
	if err := w.addfile("index.html", d.Config.Timestamp, h); err != nil {
		return nil, err
	}
	return w.todata(), nil
}
