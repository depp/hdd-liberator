package project

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"io/ioutil"
	"os"
	"os/exec"
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

func compress(ctx context.Context, data []byte) ([]byte, error) {
	fp, err := ioutil.TempFile("", "compress.*")
	if err != nil {
		return nil, err
	}
	if _, err := fp.Write(data); err != nil {
		return nil, err
	}
	name := fp.Name()
	defer func() {
		fp.Close()
		os.Remove(name)
	}()
	var buf bytes.Buffer
	cmd := exec.CommandContext(ctx, "external/zopfli/zopfli", "--deflate", "-c", name)
	cmd.Stdout = &buf
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return nil, err
	}
	// Zopfli does not use a status code for failure.
	if buf.Len() == 0 {
		return nil, errors.New("zopfli failed")
	}
	return buf.Bytes(), nil
}

func (w *zipwriter) addfile(ctx context.Context, name string, modtime time.Time, data []byte) error {
	cdata, err := compress(ctx, data)
	if err != nil {
		return err
	}

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
	h, err := d.BuildHTML(ctx, nil)
	if err != nil {
		return nil, err
	}
	var w zipwriter
	if err := w.addfile(ctx, "index.html", d.Project.Config.Timestamp, h); err != nil {
		return nil, err
	}
	return w.todata(), nil
}
